// Хранилище фото решений ученика. Пока сервера нет, фото лежат в браузере (IndexedDB)
// и никуда не отправляются. С сервером метод add будет загружать файл на проверку.
import { hasIndexedDb, openDb } from '../idb.js'
import { compressImage } from '../images.js'

export const MAX_ATTACHMENTS = 5

const view = (urls) => (record) => ({
  id: record.id,
  name: record.name,
  size: record.blob.size,
  url: urls.get(record.id) ?? urls.set(record.id, URL.createObjectURL(record.blob)).get(record.id),
})

// Общая логика поверх простого набора записей: { all(), put(record), delete(id) }
function makeFiles(records, { compress }) {
  const urls = new Map()
  const list = async (courseId, taskId) =>
    (await records.all())
      .filter((r) => r.courseId === courseId && r.taskId === taskId)
      .sort((a, b) => a.addedAt - b.addedAt)
      .map(view(urls))

  return {
    list,
    async add(courseId, taskId, file) {
      if (!file?.type?.startsWith('image/')) throw new Error('Приложить можно только фотографию или картинку.')
      if ((await list(courseId, taskId)).length >= MAX_ATTACHMENTS)
        throw new Error(`К задаче можно приложить не больше ${MAX_ATTACHMENTS} фото.`)
      // Фото с телефона весит несколько мегабайт — уменьшаем перед сохранением
      const { blob } = compress ? await compress(file) : { blob: file }
      await records.put({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, courseId, taskId, name: file.name || 'фото', blob, addedAt: Date.now() })
      return list(courseId, taskId)
    },
    async remove(courseId, taskId, id) {
      await records.delete(id)
      if (urls.has(id)) URL.revokeObjectURL(urls.get(id))
      urls.delete(id)
      return list(courseId, taskId)
    },
  }
}

// В браузере ученика
export function idbFiles() {
  if (!hasIndexedDb()) return null
  const db = openDb('edu-files', { attachments: { keyPath: 'id' } })
  return makeFiles(
    { all: () => db.getAll('attachments'), put: (r) => db.put('attachments', r), delete: (id) => db.delete('attachments', id) },
    { compress: (file) => compressImage(file, { maxSide: 1600, quality: 0.8, forceJpeg: true }) },
  )
}

// В памяти: для предпросмотра в редакторе и тестов
export function memoryFiles({ compress = null } = {}) {
  const data = new Map()
  return makeFiles(
    { all: async () => [...data.values()], put: async (r) => void data.set(r.id, r), delete: async (id) => void data.delete(id) },
    { compress },
  )
}
