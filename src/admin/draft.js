// Черновик редактора хранится в браузере того, кто его открыл, в IndexedDB:
// текст курса — одной записью, картинки — отдельными записями (в localStorage они не поместятся).
// Ключ картинки — «<_key курса>/<имя файла>».
import { mergeCourse } from '../content/format.js'
import { httpSource } from '../content/load.js'
import { openDb } from '../idb.js'
import { decorate, mimeOf } from './model.js'

const db = openDb('edu-admin', { kv: undefined, images: undefined })

export const imageKey = (courseKey, name) => `${courseKey}/${name}`

export async function loadDraft() {
  const draft = await db.get('kv', 'draft')
  if (!draft?.content) return null
  const keys = await db.keys('images')
  const records = await db.getAll('images')
  return { content: draft.content, images: Object.fromEntries(keys.map((k, i) => [k, records[i]])) }
}

export const saveContent = (content) => db.put('kv', { content, savedAt: Date.now() }, 'draft')
export const putImage = (key, record) => db.put('images', record, key)
export const deleteImage = (key) => db.delete('images', key)

// Заменить черновик целиком (первое открытие, загрузка архива, сброс)
export async function replaceDraft(content, images) {
  await db.clear('images')
  for (const [key, record] of Object.entries(images)) await db.put('images', record, key)
  await saveContent(content)
}

// То, что сейчас опубликовано на сайте: с него начинается черновик
export async function loadPublished() {
  const { site, courses } = await httpSource.loadPublic()
  const full = await Promise.all(courses.map(async (c) => mergeCourse(c, await httpSource.loadPrivate(c.id))))
  const { format, courses: ids, ...rest } = site
  const content = decorate({ site: rest, courses: full })

  const images = {}
  const missing = []
  await Promise.all(
    content.courses.flatMap((course) =>
      Object.keys(course.images).map(async (name) => {
        try {
          const response = await fetch(httpSource.imageUrl(course.id, name))
          if (!response.ok) throw new Error(String(response.status))
          const blob = await response.blob()
          images[imageKey(course._key, name)] = { blob: new Blob([blob], { type: mimeOf(name) }), orig: null }
        } catch {
          missing.push(`${course.id}/${name}`)
        }
      }),
    ),
  )
  return { content, images, missing }
}

// Архив → черновик
export function fromArchive({ content, images }) {
  const decorated = decorate(content)
  const out = {}
  for (const course of decorated.courses)
    for (const [name, record] of Object.entries(images[course.id] ?? {})) out[imageKey(course._key, name)] = record
  return { content: decorated, images: out }
}
