// Замечания редактора: общая проверка корректности контента плюс то, что видно только в черновике —
// смена id у уже опубликованного, потерянные и тяжёлые файлы картинок.
import { HEAVY_IMAGE_BYTES } from '../content/format.js'
import { validateContent } from '../content/validate.js'
import { isGroup } from '../lib.js'
import { fmtBytes } from '../images.js'
import { imageKey } from './draft.js'

export function draftIssues(content, images) {
  const issues = validateContent(content)
  const warn = (path, where, message, fix) => issues.push({ level: 'warn', path, where, message, fix })

  content.courses.forEach((course, ci) => {
    const cPath = `courses/${ci}`
    const cWhere = `Курс «${course.title || course.id}»`

    if (course._orig && course._orig !== course.id)
      warn(
        `${cPath}/id`,
        cWhere,
        `Курс уже опубликован с id «${course._orig}». После смены id у учеников обнулится весь прогресс по курсу, а старые ссылки на него перестанут открываться.`,
        { label: 'Вернуть прежний id', apply: (c) => void (c.courses[ci].id = course._orig) },
      )

    for (const name of Object.keys(course.images ?? {})) {
      const record = images[imageKey(course._key, name)]
      if (!record)
        issues.push({ level: 'error', path: `${cPath}/images/${name}`, where: cWhere, message: `Файл картинки «${name}» потерян — загрузите её заново` })
      else if (record.blob.size > HEAVY_IMAGE_BYTES)
        warn(`${cPath}/images/${name}`, cWhere, `Картинка «${name}» тяжёлая (${fmtBytes(record.blob.size)}) — страница будет грузиться дольше`)
    }

    // Прежние id опубликованных задач: кому они принадлежали
    const published = new Map()
    const eachTask = (fn) =>
      (course.lessons ?? []).forEach((lesson, li) =>
        (lesson.tasks ?? []).forEach((item, ti) => {
          if (isGroup(item)) item.tasks.forEach((t, k) => fn(t, `${cPath}/lessons/${li}/tasks/${ti}/tasks/${k}`, li))
          else fn(item, `${cPath}/lessons/${li}/tasks/${ti}`, li)
        }),
      )
    eachTask((t) => t._orig && published.set(t._orig, t._key))

    ;(course.lessons ?? []).forEach((lesson, li) => {
      if (lesson._orig && lesson._orig !== lesson.id)
        warn(
          `${cPath}/lessons/${li}/id`,
          `${cWhere} → урок ${li + 1}`,
          `Урок уже опубликован с id «${lesson._orig}». После смены id старые ссылки на урок перестанут открываться, а ответы учеников на вопросы к видео обнулятся.`,
          { label: 'Вернуть прежний id', apply: (c) => void (c.courses[ci].lessons[li].id = lesson._orig) },
        )
    })

    eachTask((task, path, li) => {
      const where = `${cWhere} → урок ${li + 1} → задача «${task.id}»`
      if (task._orig && task._orig !== task.id)
        warn(
          `${path}/id`,
          where,
          `Задача уже опубликована с id «${task._orig}». После смены id прогресс учеников по ней обнулится: решённая задача снова станет нерешённой, XP за неё пропадут.`,
          {
            label: 'Вернуть прежний id',
            apply: (c) => {
              const node = path.split('/').reduce((n, key) => n[key], c)
              node.id = task._orig
            },
          },
        )
      if (task.id && task._orig !== task.id && published.has(task.id) && published.get(task.id) !== task._key)
        warn(`${path}/id`, where, `id «${task.id}» раньше был у другой задачи: новая задача унаследует её прогресс у учеников. Лучше взять id, которого ещё не было.`)
    })
  })

  return issues
}

export function indexIssues(issues) {
  const map = new Map()
  for (const issue of issues) {
    if (!map.has(issue.path)) map.set(issue.path, [])
    map.get(issue.path).push(issue)
  }
  return map
}

// Сколько ошибок и предупреждений внутри части контента
export function countUnder(issues, prefix) {
  const inside = issues.filter((i) => i.path === prefix || i.path.startsWith(prefix + '/'))
  return { errors: inside.filter((i) => i.level === 'error').length, warns: inside.filter((i) => i.level === 'warn').length }
}
