import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../../config.js'
import { randomToken } from '../../lib/auth.js'
import { fail } from '../../lib/http.js'

const TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

// Проверяем, что содержимое файла действительно картинка нужного типа
function sniff(buf, mime) {
  const hex = buf.subarray(0, 12).toString('hex')
  if (mime === 'image/png') return hex.startsWith('89504e47')
  if (mime === 'image/jpeg') return hex.startsWith('ffd8ff')
  if (mime === 'image/gif') return hex.startsWith('47494638')
  if (mime === 'image/webp') return hex.startsWith('52494646') && hex.slice(16, 24) === '57454250'
  if (mime === 'image/svg+xml') {
    const text = buf.toString('utf8')
    // SVG может содержать скрипты — такие не принимаем
    return /<svg[\s>]/i.test(text) && !/<script|on\w+\s*=|javascript:|<foreignObject/i.test(text)
  }
  return false
}

export default async function adminUploads(app) {
  const { sql } = app

  app.post('/uploads', async (req) => {
    const file = await req.file()
    if (!file) fail(400, 'Файл не передан')
    const ext = TYPES[file.mimetype]
    if (!ext) fail(400, 'Можно загружать только картинки: PNG, JPG, GIF, WEBP, SVG')
    const buf = await file.toBuffer()
    if (!sniff(buf, file.mimetype)) fail(400, 'Файл повреждён или не является картинкой')
    const id = `${new Date().toISOString().slice(0, 7)}-${randomToken(12)}${ext}`
    await fs.writeFile(path.join(config.uploadDir, id), buf)
    await sql`INSERT INTO uploads (id, original, mime, size, created_by)
      VALUES (${id}, ${file.filename.slice(0, 300)}, ${file.mimetype}, ${buf.length}, ${req.user.id})`
    return { id, url: `/uploads/${id}`, name: file.filename }
  })

  app.get('/uploads', async () => {
    const rows = await sql`SELECT * FROM uploads ORDER BY created_at DESC LIMIT 500`
    return { uploads: rows.map((u) => ({ id: u.id, url: `/uploads/${u.id}`, name: u.original, size: u.size, createdAt: u.created_at })) }
  })
}
