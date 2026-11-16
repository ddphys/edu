// Чтение контента с диска (public/content) и его полная проверка.
// Используется при сборке сайта (vite.config.js), в тестах и в команде npm run check.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HEAVY_IMAGE_BYTES, filesToContent, paths } from '../src/content/format.js'
import { errorsOnly, formatIssues, validateContent, warningsOnly } from '../src/content/validate.js'
import { courseTasks } from '../src/lib.js'

export const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/content')

// Читает контент из папки и возвращает { content, issues }.
// issues — замечания к самим файлам (битый JSON, нет картинки на диске и т. п.)
// плюс всё, что нашла общая проверка корректности.
export function checkContentDir(dir = CONTENT_DIR) {
  const issues = []
  const fileIssue = (level, file, message) => issues.push({ level, path: '', where: `Файл ${file}`, message })
  const raw = {}

  const read = (rel) => {
    if (rel in raw) return raw[rel]
    const file = path.join(dir, rel)
    if (!fs.existsSync(file)) return (raw[rel] = undefined)
    try {
      return (raw[rel] = JSON.parse(fs.readFileSync(file, 'utf8')))
    } catch (e) {
      fileIssue('error', rel, `не читается как JSON — ${e.message}`)
      return (raw[rel] = undefined)
    }
  }

  let content
  try {
    content = filesToContent(read)
  } catch (e) {
    fileIssue('error', paths.site, e.message)
    return { content: null, issues }
  }
  if (issues.length) return { content, issues }

  for (const course of content.courses) {
    const pub = read(paths.course(course.id))
    const priv = read(paths.answers(course.id))
    if (pub.id !== course.id || !fs.existsSync(path.join(dir, paths.course(course.id))))
      fileIssue('error', paths.course(course.id), `id курса внутри файла («${pub.id}») не совпадает с именем папки`)
    if (!priv) fileIssue('error', paths.answers(course.id), 'файла с ответами нет')

    // Открытая и закрытая части должны описывать одни и те же задачи
    const ids = new Set(courseTasks(course).map((t) => t.id))
    for (const id of Object.keys(priv?.tasks ?? {}))
      if (!ids.has(id)) fileIssue('warn', paths.answers(course.id), `есть ответ для задачи «${id}», которой нет в курсе`)
    for (const t of courseTasks(pub))
      if ((t.hintCount ?? 0) !== (priv?.tasks?.[t.id]?.hints?.length ?? 0))
        fileIssue('error', paths.course(course.id), `у задачи «${t.id}» записано подсказок: ${t.hintCount ?? 0}, а в answers.json их ${priv?.tasks?.[t.id]?.hints?.length ?? 0}`)
    for (const lesson of pub.lessons ?? [])
      if ((lesson.quiz?.length ?? 0) !== (priv?.quiz?.[lesson.id]?.length ?? 0))
        fileIssue('error', paths.answers(course.id), `у урока «${lesson.id}» вопросов к видео: ${lesson.quiz?.length ?? 0}, а ответов на них: ${priv?.quiz?.[lesson.id]?.length ?? 0}`)

    // Картинки: всё из списка должно лежать на диске
    const imagesDir = path.join(dir, paths.images(course.id))
    const onDisk = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir) : []
    for (const name of Object.keys(course.images ?? {})) {
      const rel = paths.image(course.id, name)
      if (!onDisk.includes(name)) fileIssue('error', rel, 'картинка есть в списке курса, но самого файла нет')
      else if (fs.statSync(path.join(imagesDir, name)).size > HEAVY_IMAGE_BYTES)
        fileIssue('warn', rel, `картинка тяжёлая (${Math.round(fs.statSync(path.join(imagesDir, name)).size / 1024)} КБ) — сожмите её в редакторе`)
    }
    for (const name of onDisk)
      if (!course.images?.[name]) fileIssue('warn', paths.image(course.id, name), 'файл лежит в папке картинок, но в курсе не записан')
  }

  issues.push(...validateContent(content))
  return { content, issues }
}

// Проверка для сборки: печатает предупреждения, при ошибках бросает исключение с понятным списком
export function assertContentOk(dir = CONTENT_DIR, log = console.warn) {
  const { issues } = checkContentDir(dir)
  const errors = errorsOnly(issues)
  const warnings = warningsOnly(issues)
  if (warnings.length) log(`\nКонтент: предупреждения (${warnings.length})\n${formatIssues(warnings)}\n`)
  if (errors.length)
    throw new Error(
      `В контенте (public/content) есть ошибки (${errors.length}) — сайт не собран:\n${formatIssues(errors)}\n\n` +
        'Исправьте их в редакторе курса (#/admin) и выгрузите архив заново.',
    )
  return { warnings }
}

// Запуск из командной строки: npm run check
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assertContentOk(CONTENT_DIR, console.log)
    console.log('Контент в порядке.')
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
