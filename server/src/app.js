import fs from 'node:fs'
import path from 'node:path'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { config } from './config.js'
import { COOKIE, isStaff, sha256 } from './lib/auth.js'
import { fail } from './lib/http.js'
import authRoutes from './routes/auth.js'
import studentRoutes from './routes/student.js'
import adminUsers from './routes/admin/users.js'
import adminContent from './routes/admin/content.js'
import adminTasks from './routes/admin/tasks.js'
import adminStats from './routes/admin/stats.js'
import adminUploads from './routes/admin/uploads.js'

export async function buildApp({ sql, logger = false } = {}) {
  const app = Fastify({ logger, bodyLimit: 2 * 1024 * 1024, trustProxy: true })
  app.decorate('sql', sql)

  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } })

  // Кто делает запрос: читаем сессию из cookie
  app.decorateRequest('user', null)
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[COOKIE]
    if (!token) return
    const [u] = await sql`
      SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${sha256(token)} AND s.expires_at > now() AND NOT u.blocked`
    if (!u) return
    req.user = u
    // last_seen обновляем не чаще раза в 5 минут
    if (!u.last_seen_at || Date.now() - u.last_seen_at.getTime() > 5 * 60e3) {
      await sql`UPDATE users SET last_seen_at = now() WHERE id = ${u.id}`
    }
  })

  // Защита от CSRF: изменяющие запросы к API принимаем только как JSON/multipart со своего сайта
  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
    const origin = req.headers.origin
    if (origin && new URL(origin).host !== req.headers.host) fail(403, 'Запрос с чужого сайта')
  })

  app.decorate('requireUser', async (req) => {
    if (!req.user) fail(401, 'Нужно войти')
  })
  app.decorate('requireStaff', async (req) => {
    if (!req.user) fail(401, 'Нужно войти')
    if (!isStaff(req.user)) fail(403, 'Нет доступа')
  })
  app.decorate('requireAdmin', async (req) => {
    if (!req.user) fail(401, 'Нужно войти')
    if (req.user.role !== 'admin') fail(403, 'Только для администратора')
  })

  app.setErrorHandler((err, req, reply) => {
    const code = err.statusCode && err.statusCode < 600 ? err.statusCode : 500
    if (code >= 500) req.log.error(err)
    const message =
      code === 413 ? 'Файл слишком большой' : code >= 500 ? 'Ошибка сервера' : err.message || 'Ошибка'
    reply.code(code).send({ error: message })
  })

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(studentRoutes, { prefix: '/api' })
  await app.register(
    async (admin) => {
      admin.addHook('preHandler', admin.requireStaff)
      await admin.register(adminUsers)
      await admin.register(adminContent)
      await admin.register(adminTasks)
      await admin.register(adminStats)
      await admin.register(adminUploads)
    },
    { prefix: '/api/admin' },
  )

  app.get('/api/health', async () => ({ ok: true }))

  // Картинки задач
  fs.mkdirSync(config.uploadDir, { recursive: true })
  await app.register(fastifyStatic, {
    root: config.uploadDir,
    prefix: '/uploads/',
    decorateReply: false,
    maxAge: '30d',
    immutable: true,
    // Даже если в SVG окажется скрипт, при прямом открытии файла он не выполнится
    setHeaders: (res) => {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
      res.setHeader('X-Content-Type-Options', 'nosniff')
    },
  })

  // Собранный фронтенд. Все незнакомые адреса отдают index.html (маршрутизация в браузере).
  const hasStatic = fs.existsSync(path.join(config.staticDir, 'index.html'))
  if (hasStatic) await app.register(fastifyStatic, { root: config.staticDir, prefix: '/', wildcard: false })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/') || !hasStatic || req.method !== 'GET') {
      return reply.code(404).send({ error: 'Не найдено' })
    }
    return reply.sendFile('index.html', config.staticDir)
  })

  return app
}
