// Проверка корректности контента. Работает с «полным» контентом { site, courses }
// и возвращает список замечаний:
//   { level: 'error' | 'warn', path, where, message }
// path — адрес поля внутри контента («courses/0/lessons/1/tasks/2/answer»): по нему редактор
// показывает замечание рядом с полем. where — то же словами, для сообщения при сборке.
// Ошибка (error) останавливает сборку сайта и выгрузку из редактора, предупреждение (warn) — нет.
import katex from 'katex'
import { isGroup, parseVideo } from '../lib.js'
import { DEFAULT_TYPE, typeOf, types } from '../types/index.js'
import { IMAGE_NAME, textFormulas, textImages } from './text.js'

// id попадает в адрес страницы и в имя папки: латиница, цифры, дефис, подчёркивание
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const ID_HINT = 'только латинские буквы, цифры, дефис и подчёркивание, без пробелов'

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isInt = (v) => Number.isInteger(v)
const filled = (v) => typeof v === 'string' && v.trim() !== ''
const short = (s, n = 40) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s))

export function validateContent(content) {
  const issues = []
  const add = (level, path, where, message) => issues.push({ level, path, where, message })
  const error = (path, where, message) => add('error', path, where, message)
  const warn = (path, where, message) => add('warn', path, where, message)

  const site = content?.site ?? {}
  const courses = content?.courses ?? []

  if (!filled(site.title)) warn('site/title', 'Сайт', 'У сайта нет названия')
  if (courses.length === 0) error('courses', 'Сайт', 'Нет ни одного курса')
  if (site.legacyCourse && !courses.some((c) => c.id === site.legacyCourse))
    error(
      'site/legacyCourse',
      'Сайт',
      `Курс «${site.legacyCourse}», в который переносится старый прогресс учеников, не найден`,
    )

  const courseIds = new Map()
  courses.forEach((course, ci) => {
    const cPath = `courses/${ci}`
    const cWhere = `Курс «${short(course.title || course.id || ci + 1)}»`

    // ----- сам курс -----
    if (!filled(course.id)) error(`${cPath}/id`, cWhere, 'У курса нет id')
    else if (!ID_PATTERN.test(course.id)) error(`${cPath}/id`, cWhere, `id курса «${course.id}»: ${ID_HINT}`)
    else if (courseIds.has(course.id)) error(`${cPath}/id`, cWhere, `id курса «${course.id}» повторяется`)
    else courseIds.set(course.id, ci)

    if (!filled(course.title)) error(`${cPath}/title`, cWhere, 'У курса нет названия')
    if (!filled(course.teacher?.name)) warn(`${cPath}/teacher/name`, cWhere, 'Не указан преподаватель')
    checkXpRules(course, cPath, cWhere, error)

    // ----- картинки курса -----
    const images = course.images ?? {}
    const usedImages = new Set()
    for (const [name, info] of Object.entries(images)) {
      if (!IMAGE_NAME.test(name))
        error(`${cPath}/images/${name}`, cWhere, `Имя картинки «${name}»: нужны латиница и расширение png, jpg, gif, webp или svg`)
      if (!(info?.w > 0 && info?.h > 0))
        error(`${cPath}/images/${name}`, cWhere, `У картинки «${name}» не записан размер (w и h) — страница будет дёргаться при загрузке`)
    }
    const useImage = (name, path, where) => {
      usedImages.add(name)
      if (!images[name]) error(path, where, `Картинки «${name}» нет в курсе`)
    }
    if (course.cover) useImage(course.cover, `${cPath}/cover`, cWhere)
    if (course.teacher?.photo && !/^https?:\/\//.test(course.teacher.photo)) useImage(course.teacher.photo, `${cPath}/teacher/photo`, cWhere)

    // Текст с разметкой: формулы и картинки
    const checkText = (text, path, where, what) => {
      if (typeof text !== 'string') return
      for (const name of textImages(text)) useImage(name, path, where)
      const { formulas, strayDollar } = textFormulas(text)
      for (const f of formulas) {
        try {
          katex.renderToString(f.src, { displayMode: f.display, throwOnError: true, strict: 'ignore' })
        } catch (e) {
          error(path, where, `${what}: ошибка в формуле «${short(f.src, 30)}» — ${String(e.message).replace(/^KaTeX parse error: /, '')}`)
        }
      }
      if (strayDollar) warn(path, where, `${what}: знак $ без пары — формула не отрисуется`)
    }

    // ----- уроки -----
    const lessonIds = new Set()
    const taskIds = new Map()
    ;(course.lessons ?? []).forEach((lesson, li) => {
      const lPath = `${cPath}/lessons/${li}`
      const lWhere = `${cWhere} → урок ${li + 1} «${short(lesson.title || lesson.id || '')}»`

      if (!filled(lesson.id)) error(`${lPath}/id`, lWhere, 'У урока нет id')
      else if (!ID_PATTERN.test(lesson.id)) error(`${lPath}/id`, lWhere, `id урока «${lesson.id}»: ${ID_HINT}`)
      else if (lessonIds.has(lesson.id)) error(`${lPath}/id`, lWhere, `id урока «${lesson.id}» повторяется в курсе`)
      else lessonIds.add(lesson.id)

      if (!filled(lesson.title)) error(`${lPath}/title`, lWhere, 'У урока нет названия')
      if (lesson.description !== undefined && !Array.isArray(lesson.description))
        error(`${lPath}/description`, lWhere, 'Темы урока должны быть списком строк')

      const hasVideo = filled(lesson.videoUrl)
      if (hasVideo && !parseVideo(lesson.videoUrl))
        error(`${lPath}/videoUrl`, lWhere, 'Ссылка на видео не распознана: подходят YouTube, Rutube, Kinescope или прямая ссылка на mp4/webm')

      // ----- вопросы по ходу видео -----
      const quiz = lesson.quiz ?? []
      if (quiz.length && !hasVideo) warn(`${lPath}/videoUrl`, lWhere, 'У урока есть вопросы по ходу видео, но нет видео — вопросы не появятся')
      const times = new Set()
      quiz.forEach((q, qi) => {
        const qPath = `${lPath}/quiz/${qi}`
        const qWhere = `${lWhere} → вопрос к видео ${qi + 1}`
        if (!(isNum(q.time) && q.time >= 0)) error(`${qPath}/time`, qWhere, 'Время вопроса — секунда от начала видео, число не меньше нуля')
        else if (times.has(q.time)) warn(`${qPath}/time`, qWhere, 'На эту секунду уже стоит другой вопрос')
        else times.add(q.time)
        if (!filled(q.question)) error(`${qPath}/question`, qWhere, 'У вопроса нет текста')
        checkText(q.question, `${qPath}/question`, qWhere, 'Текст вопроса')
        const options = Array.isArray(q.options) ? q.options : []
        if (options.length < 2) error(`${qPath}/options`, qWhere, 'У вопроса должно быть хотя бы два варианта ответа')
        options.forEach((o, oi) => {
          if (!filled(o)) error(`${qPath}/options/${oi}`, qWhere, `Вариант ${oi + 1} пустой`)
          checkText(o, `${qPath}/options/${oi}`, qWhere, `Вариант ${oi + 1}`)
        })
        if (!isInt(q.correct)) error(`${qPath}/correct`, qWhere, 'Не отмечен верный вариант')
        else if (q.correct < 0 || q.correct >= options.length)
          error(`${qPath}/correct`, qWhere, `Номер верного варианта (${q.correct + 1}) вне списка: вариантов всего ${options.length}`)
        checkText(q.explain, `${qPath}/explain`, qWhere, 'Пояснение')
      })

      // ----- задачи -----
      const checkTask = (task, tPath, number) => {
        const tWhere = `${lWhere} → задача ${number} «${short(task.id || task.title || '')}»`
        if (!filled(task.id)) error(`${tPath}/id`, tWhere, 'У задачи нет id')
        else if (!ID_PATTERN.test(task.id)) error(`${tPath}/id`, tWhere, `id задачи «${task.id}»: ${ID_HINT}`)
        else if (taskIds.has(task.id))
          error(`${tPath}/id`, tWhere, `id задачи «${task.id}» повторяется в курсе (уже есть: ${taskIds.get(task.id)}) — прогресс двух задач смешается`)
        else taskIds.set(task.id, tWhere.split(' → ').slice(1).join(' → '))

        if (!filled(task.title)) warn(`${tPath}/title`, tWhere, 'У задачи нет названия')
        if (!filled(task.text)) error(`${tPath}/text`, tWhere, 'У задачи нет условия')
        checkText(task.text, `${tPath}/text`, tWhere, 'Условие')

        if (task.level !== undefined && !(isInt(task.level) && task.level >= 1 && task.level <= 5))
          error(`${tPath}/level`, tWhere, 'Уровень сложности — целое число от 1 до 5')
        if (task.xp !== undefined && !(isInt(task.xp) && task.xp >= 1)) error(`${tPath}/xp`, tWhere, 'Точная цена задачи — целое число XP, не меньше 1')

        ;(task.hints ?? []).forEach((h, hi) => {
          if (!filled(h)) error(`${tPath}/hints/${hi}`, tWhere, `Подсказка ${hi + 1} пустая`)
          checkText(h, `${tPath}/hints/${hi}`, tWhere, `Подсказка ${hi + 1}`)
        })
        checkText(task.solution, `${tPath}/solution`, tWhere, 'Разбор')
        ;(task.rubric ?? []).forEach((r, ri) => {
          if (!filled(r)) error(`${tPath}/rubric/${ri}`, tWhere, `Критерий ${ri + 1} пустой`)
        })
        if (task.rubric?.length && !task.attach)
          warn(`${tPath}/rubric`, tWhere, 'Критерии проверки заданы, но ученик не может приложить решение — включите «Можно приложить фото решения»')

        const type = typeOf(task)
        if (!type) {
          error(`${tPath}/type`, tWhere, `Неизвестный тип задачи «${task.type}». Известные: ${Object.keys(types).join(', ')}`)
          return
        }
        type.validate(task, (field, message, level = 'error') => add(level, `${tPath}/${field}`, tWhere, message))
        for (const { field, text, what } of type.texts?.(task) ?? []) checkText(text, `${tPath}/${field}`, tWhere, what)
      }

      let number = 0
      ;(lesson.tasks ?? []).forEach((item, ti) => {
        const iPath = `${lPath}/tasks/${ti}`
        if (!isGroup(item)) return checkTask(item, iPath, ++number)
        if (item.tasks.length === 0) warn(iPath, `${lWhere} → группа «${short(item.title || '')}»`, 'В группе нет задач — она не будет показана')
        item.tasks.forEach((task, k) => {
          if (isGroup(task)) return error(`${iPath}/tasks/${k}`, lWhere, 'Группа внутри группы не поддерживается')
          checkTask(task, `${iPath}/tasks/${k}`, ++number)
        })
      })
    })

    for (const name of Object.keys(images))
      if (!usedImages.has(name)) warn(`${cPath}/images/${name}`, cWhere, `Картинка «${name}» нигде не используется`)
  })

  return issues
}

function checkXpRules(course, cPath, cWhere, error) {
  const share = (key, title) => {
    const v = course[key]
    if (!(isNum(v) && v >= 0 && v <= 1)) error(`${cPath}/${key}`, cWhere, `${title} — доля от цены задачи, число от 0 до 1`)
  }
  for (const level of [1, 2, 3, 4, 5]) {
    const v = course.levelXp?.[level]
    if (!(isInt(v) && v >= 1)) error(`${cPath}/levelXp/${level}`, cWhere, `Цена задачи уровня ${level} — целое число XP, не меньше 1`)
  }
  if (!(isInt(course.defaultLevel) && course.defaultLevel >= 1 && course.defaultLevel <= 5))
    error(`${cPath}/defaultLevel`, cWhere, 'Уровень по умолчанию — целое число от 1 до 5')
  share('errorPenalty', 'Штраф за ошибку')
  share('hintPenalty', 'Штраф за подсказку')
  share('minShare', 'Минимум за самостоятельное решение')
  if (!(isInt(course.cooldownFromError) && course.cooldownFromError >= 1))
    error(`${cPath}/cooldownFromError`, cWhere, 'Номер ошибки, с которой начинается пауза, — целое число не меньше 1')
  if (!(isNum(course.cooldownSeconds) && course.cooldownSeconds >= 0))
    error(`${cPath}/cooldownSeconds`, cWhere, 'Длина паузы — число секунд, не меньше нуля')
}

export const errorsOnly = (issues) => issues.filter((i) => i.level === 'error')
export const warningsOnly = (issues) => issues.filter((i) => i.level === 'warn')

// Список замечаний текстом — для сообщения при сборке
export function formatIssues(issues) {
  return issues.map((i) => `  ${i.level === 'error' ? '✗' : '!'} ${i.where}: ${i.message}`).join('\n')
}

