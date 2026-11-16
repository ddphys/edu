// Локальная реализация интерфейса (описан в api/index.js): всё происходит в браузере.
// Контент берётся из источника (source), прогресс хранится в хранилище строк (kv),
// фото решений — в хранилище файлов (files). Страница ученика, предпросмотр в редакторе
// и тесты собирают её с разными источниками и хранилищами.
import { mergeCourse } from '../content/format.js'
import { courseTasks } from '../lib.js'
import { applyHint, applyQuizAnswer, applySkip, applySubmit, normalize, revealedFor } from './engine.js'
import { addEvent, readJournal, writeJournal } from './attempts.js'
import { emptyCourseProgress, emptyProgress, readProgress, writeProgress } from './progress.js'

// Какие исходы действия над задачей попадают в журнал попыток
const LOGGED = { wrong: 'wrong', correct: 'correct', invalid: 'invalid', hint: 'hint', skipped: 'skip' }

export function createLocalApi({ source, kv, files = null, now = () => Date.now(), viewer = {} }) {
  let publicPromise = null
  const fullPromises = {}
  let progress = null
  let journal = null

  const getContent = () => (publicPromise ??= source.loadPublic())

  // Полный курс (с ответами) и быстрый поиск задач по id
  const getFull = (courseId) =>
    (fullPromises[courseId] ??= (async () => {
      const { courses } = await getContent()
      const pub = courses.find((c) => c.id === courseId)
      if (!pub) throw new Error(`Курс «${courseId}» не найден`)
      const course = mergeCourse(pub, await source.loadPrivate(courseId))
      return { course, tasks: new Map(courseTasks(course).map((t) => [t.id, t])) }
    })())

  async function getTask(courseId, taskId) {
    const { course, tasks } = await getFull(courseId)
    const task = tasks.get(taskId)
    if (!task) throw new Error(`Задача «${taskId}» не найдена в курсе «${courseId}»`)
    return { course, task }
  }

  async function loadProgress() {
    if (progress) return progress
    const { site } = await getContent()
    progress = readProgress(kv, site.legacyCourse ?? site.courses?.[0])
    return progress
  }

  // Для записи — заводит прогресс курса, если его ещё нет; для чтения — ничего не создаёт
  const courseProgress = (courseId) => (progress.courses[courseId] ??= emptyCourseProgress())
  const savedTasks = (courseId) => progress.courses[courseId]?.tasks ?? {}
  const save = () => writeProgress(kv, progress)

  // Журнал попыток (см. attempts.js): неверные ответы, время, подсказки
  function log(event) {
    journal ??= readJournal(kv)
    addEvent(journal, { at: now(), ...event })
    writeJournal(kv, journal)
  }

  // Общий ход действия над задачей: взять состояние, применить правило, сохранить.
  // input — что отправил ученик, meta.ms — сколько задача была на экране; оба идут только в журнал.
  async function act(courseId, taskId, rule, { input, meta } = {}) {
    const { course, task } = await getTask(courseId, taskId)
    await loadProgress()
    const result = rule(course, task, normalize(savedTasks(courseId)[taskId]))
    if (result.kind !== 'noop' && result.kind !== 'locked' && result.kind !== 'invalid') {
      courseProgress(courseId).tasks[taskId] = result.state
      save()
    }
    if (LOGGED[result.kind])
      log({ course: courseId, task: taskId, kind: LOGGED[result.kind], input, ms: meta?.ms, hints: result.state.hintsUsed, errors: result.state.errors })
    return { ...result, revealed: revealedFor(task, result.state) }
  }

  return {
    getContent,

    async getViewer() {
      // Без сервера аккаунтов и тарифов нет: приложить решение может каждый
      return { features: { attachSolution: Boolean(files), ...viewer.features } }
    },

    async getProgress() {
      return structuredClone(await loadProgress())
    },

    async getRevealed(courseId, taskIds) {
      const { tasks } = await getFull(courseId)
      await loadProgress()
      const saved = savedTasks(courseId)
      const out = {}
      for (const id of taskIds) if (tasks.has(id)) out[id] = revealedFor(tasks.get(id), saved[id])
      return out
    },

    takeHint: (courseId, taskId, meta) => act(courseId, taskId, (course, task, state) => applyHint(task, state), { meta }),
    submitAnswer: (courseId, taskId, input, meta) =>
      act(courseId, taskId, (course, task, state) => applySubmit(course, task, state, input, now()), { input, meta }),
    skipTask: (courseId, taskId, meta) => act(courseId, taskId, (course, task, state) => applySkip(task, state), { meta }),

    // Журнал попыток целиком: { version, events }
    async getAttempts() {
      return structuredClone((journal ??= readJournal(kv)))
    },

    async answerQuiz(courseId, lessonId, index, choice, options = {}) {
      const { course } = await getFull(courseId)
      const question = course.lessons.find((l) => l.id === lessonId)?.quiz?.[index]
      if (!question) throw new Error('Вопрос не найден')
      await loadProgress()
      const quiz = (courseProgress(courseId).quiz[lessonId] ??= {})
      quiz[index] = applyQuizAnswer(question, quiz[index], choice, options)
      save()
      return { saved: { ...quiz[index] }, correct: question.correct, explain: question.explain ?? null }
    },

    // Пропуск вопроса при повторе в конце видео тоже считается: повтор бывает один раз
    async skipQuizRetry(courseId, lessonId, index) {
      await loadProgress()
      const quiz = (courseProgress(courseId).quiz[lessonId] ??= {})
      quiz[index] = { ...quiz[index], retried: true }
      save()
      return { saved: { ...quiz[index] } }
    },

    async resetProgress(courseId) {
      await loadProgress()
      // Журнал попыток не стираем: в нём остаётся отметка о сбросе
      for (const id of courseId ? [courseId] : Object.keys(progress.courses)) log({ course: id, kind: 'reset' })
      if (courseId) delete progress.courses[courseId]
      else progress = emptyProgress()
      save()
      return structuredClone(progress)
    },

    imageUrl: (courseId, name) => source.imageUrl(courseId, name),

    // Фото решений
    listAttachments: async (courseId, taskId) => (files ? files.list(courseId, taskId) : []),
    addAttachment: async (courseId, taskId, file) => (files ? files.add(courseId, taskId, file) : []),
    removeAttachment: async (courseId, taskId, id) => (files ? files.remove(courseId, taskId, id) : []),

    // Забыть загруженный контент (нужно предпросмотру, когда черновик изменился)
    invalidateContent() {
      publicPromise = null
      for (const key of Object.keys(fullPromises)) delete fullPromises[key]
    },
  }
}
