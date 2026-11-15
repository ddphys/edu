// Формат контента. Сайт, редактор и проверка при сборке работают с одними и теми же файлами:
//
//   public/content/
//     site.json                         — название сайта и порядок курсов
//     courses/<id курса>/course.json    — ОТКРЫТАЯ часть: всё, что ученик может видеть до ответа
//                                         (настройки курса, уроки, условия задач, варианты)
//     courses/<id курса>/answers.json   — ЗАКРЫТАЯ часть: верные ответы, подсказки, разборы,
//                                         критерии проверки, ответы на вопросы к видео
//     courses/<id курса>/images/…       — картинки курса
//
// Пока сервера нет, отдаются оба файла. Сервер будет отдавать ученику только course.json,
// а answers.json оставит у себя: подсказки и разбор — по запросу, ответы — никогда.
//
// Внутри программы (редактор, проверка корректности, проверка ответа) удобнее «полный» курс,
// где у задачи все поля лежат вместе. splitCourse режет полный курс на две части,
// mergeCourse собирает обратно.
import { isGroup } from '../lib.js'
import { DEFAULT_TYPE, typeOf } from '../types/index.js'

export const FORMAT = 1

export const paths = {
  site: 'site.json',
  course: (id) => `courses/${id}/course.json`,
  answers: (id) => `courses/${id}/answers.json`,
  images: (id) => `courses/${id}/images/`,
  image: (id, name) => `courses/${id}/images/${name}`,
}

// Убирает пустые поля и служебные поля редактора (они начинаются с «_»)
const isEmpty = (v) => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0)
function clean(obj, { keepFalse = [] } = {}) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue
    if (isEmpty(v) && !(v === false && keepFalse.includes(k))) continue
    out[k] = v
  }
  return out
}

// ---------- Задача ----------
function splitTask(task) {
  const type = typeOf(task)
  const { pub = {}, priv = {} } = type ? type.split(task) : {}
  return {
    pub: clean({
      id: task.id,
      type: task.type ?? DEFAULT_TYPE,
      level: task.level,
      xp: task.xp,
      title: task.title,
      text: task.text,
      ...pub,
      attach: task.attach, // можно приложить фото решения
      hintCount: task.hints?.length || undefined, // сами подсказки — в закрытой части
    }),
    priv: clean({ ...priv, hints: task.hints, solution: task.solution, rubric: task.rubric }),
  }
}

function mergeTask(pub, priv = {}) {
  const { hintCount, ...rest } = pub
  const type = typeOf(pub)
  return clean({
    ...rest,
    type: pub.type ?? DEFAULT_TYPE,
    ...(type ? type.merge(pub, priv) : {}),
    hints: priv.hints,
    solution: priv.solution,
    rubric: priv.rubric,
  })
}

// ---------- Курс ----------
// Полный курс → { course: открытая часть, answers: закрытая часть }
export function splitCourse(full) {
  const answers = { format: FORMAT, tasks: {}, quiz: {} }

  const task = (t) => {
    const { pub, priv } = splitTask(t)
    answers.tasks[t.id] = priv
    return pub
  }

  const lessons = (full.lessons ?? []).map((lesson) => {
    const quiz = lesson.quiz ?? []
    if (quiz.length)
      answers.quiz[lesson.id] = quiz.map((q) => clean({ correct: q.correct, explain: q.explain }, { keepFalse: [] }))
    return clean({
      ...lesson,
      quiz: quiz.map((q) => clean({ time: q.time ?? 0, question: q.question, options: q.options ?? [] })),
      tasks: (lesson.tasks ?? []).map((item) =>
        isGroup(item) ? { ...clean({ title: item.title }), tasks: item.tasks.map(task) } : task(item),
      ),
    })
  })

  return { course: { format: FORMAT, ...clean({ ...full, format: undefined, lessons: undefined }), lessons }, answers }
}

// Открытая и закрытая части → полный курс. Без закрытой части получится курс без ответов.
export function mergeCourse(course, answers) {
  const privTasks = answers?.tasks ?? {}
  const privQuiz = answers?.quiz ?? {}
  const { format, ...rest } = course

  const lessons = (course.lessons ?? []).map((lesson) => {
    const quizAnswers = privQuiz[lesson.id] ?? []
    return clean({
      ...lesson,
      quiz: (lesson.quiz ?? []).map((q, i) => ({ ...q, ...quizAnswers[i] })),
      tasks: (lesson.tasks ?? []).map((item) =>
        isGroup(item)
          ? { ...clean({ title: item.title }), tasks: item.tasks.map((t) => mergeTask(t, privTasks[t.id])) }
          : mergeTask(item, privTasks[item.id]),
      ),
    })
  })

  return { ...rest, lessons }
}

// ---------- Весь контент ----------
// Полный контент { site, courses } → файлы { 'site.json': объект, 'courses/…/course.json': объект, … }
export function contentToFiles(content) {
  const files = {}
  files[paths.site] = {
    format: FORMAT,
    ...clean({ ...content.site, format: undefined, courses: undefined }),
    courses: content.courses.map((c) => c.id),
  }
  for (const full of content.courses) {
    const { course, answers } = splitCourse(full)
    files[paths.course(full.id)] = course
    files[paths.answers(full.id)] = answers
  }
  return files
}

// Файлы (уже разобранные из JSON) → полный контент. read(путь) возвращает объект или undefined.
export function filesToContent(read) {
  const site = read(paths.site)
  if (!site) throw new Error(`Нет файла ${paths.site}`)
  const { format, courses: ids = [], ...rest } = site
  const courses = ids.map((id) => {
    const course = read(paths.course(id))
    if (!course) throw new Error(`Курс «${id}» указан в ${paths.site}, но файла ${paths.course(id)} нет`)
    return mergeCourse(course, read(paths.answers(id)))
  })
  return { site: rest, courses }
}

// JSON так, как он лежит в репозитории: с отступами, чтобы изменения было видно построчно
export const toJson = (value) => JSON.stringify(value, null, 2) + '\n'
