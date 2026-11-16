// Архив для репозитория. Распаковывается в корень репозитория, файлы встают на свои места:
//   public/content/site.json
//   public/content/courses/<id курса>/course.json, answers.json, images/…
//   originals/courses/<id курса>/images/…   — несжатые оригиналы картинок (на сайт не попадают)
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { contentToFiles, filesToContent, paths, toJson } from '../content/format.js'
import { mimeOf } from './model.js'

export const CONTENT_ROOT = 'public/content/'
export const ORIGINALS_ROOT = 'originals/'

const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer())
const stem = (name) => name.replace(/\.[^.]*$/, '')
const ext = (name) => name.split('.').pop()

// content — полный контент; imagesOf(курс) → { имя: { blob, orig?: { blob, name } } }
export async function buildArchive(content, imagesOf) {
  const zip = {}
  for (const [path, value] of Object.entries(contentToFiles(content))) zip[CONTENT_ROOT + path] = strToU8(toJson(value))
  for (const course of content.courses) {
    const images = imagesOf(course)
    for (const name of Object.keys(course.images ?? {})) {
      const record = images[name]
      if (!record) throw new Error(`Курс «${course.title}»: файл картинки «${name}» потерян — загрузите её заново`)
      // Картинки уже сжаты — кладём без повторного сжатия
      zip[CONTENT_ROOT + paths.image(course.id, name)] = [await bytes(record.blob), { level: 0 }]
      if (record.orig)
        zip[`${ORIGINALS_ROOT}${paths.images(course.id)}${stem(name)}.${ext(record.orig.name || name)}`] = [await bytes(record.orig.blob), { level: 0 }]
    }
  }
  return new Blob([zipSync(zip)], { type: 'application/zip' })
}

// Читает архив. Возвращает { content, images: { [id курса]: { [имя]: { blob, orig } } } }
export async function readArchive(file) {
  let entries
  try {
    entries = unzipSync(await bytes(file))
  } catch {
    throw new Error('Файл не читается как zip-архив.')
  }
  // Архив могли перепаковать вместе с внешней папкой — ищем, где в нём лежит public/content
  const siteKey = Object.keys(entries).find((k) => !k.startsWith('__MACOSX') && k.endsWith(CONTENT_ROOT + paths.site))
  if (!siteKey) throw new Error('В архиве нет файла public/content/site.json — это не архив из редактора.')
  const prefix = siteKey.slice(0, -(CONTENT_ROOT + paths.site).length)

  const read = (path) => {
    const data = entries[prefix + CONTENT_ROOT + path]
    if (!data) return undefined
    try {
      return JSON.parse(strFromU8(data))
    } catch (e) {
      throw new Error(`Файл ${path} в архиве не читается как JSON — ${e.message}`)
    }
  }
  const content = filesToContent(read)

  const images = {}
  for (const course of content.courses) {
    images[course.id] = {}
    const origDir = `${prefix}${ORIGINALS_ROOT}${paths.images(course.id)}`
    const originals = Object.keys(entries).filter((k) => k.startsWith(origDir) && !k.endsWith('/'))
    for (const name of Object.keys(course.images ?? {})) {
      const data = entries[prefix + CONTENT_ROOT + paths.image(course.id, name)]
      if (!data) continue // проверка корректности покажет, что файла нет
      const origKey = originals.find((k) => stem(k.slice(origDir.length)) === stem(name))
      images[course.id][name] = {
        blob: new Blob([data], { type: mimeOf(name) }),
        orig: origKey ? { blob: new Blob([entries[origKey]], { type: mimeOf(origKey) }), name: origKey.slice(origDir.length) } : null,
      }
    }
  }
  return { content, images }
}
