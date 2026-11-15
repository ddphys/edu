import { config } from '../config.js'
import {
  COOKIE,
  createSession,
  hashPassword,
  normEmail,
  publicUser,
  setSessionCookie,
  sha256,
  validEmail,
  validatePassword,
  verifyPassword,
} from '../lib/auth.js'
import { fail, str } from '../lib/http.js'

async function findInvite(sql, code) {
  if (!code) return null
  const [inv] = await sql`
    SELECT * FROM invites
    WHERE code = ${String(code)} AND NOT disabled
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR uses < max_uses)`
  return inv || null
}

// Простое ограничение частоты попыток входа (в памяти процесса)
const loginHits = new Map()
function tooManyAttempts(key) {
  const now = Date.now()
  const hits = (loginHits.get(key) || []).filter((t) => now - t < 15 * 60e3)
  hits.push(now)
  loginHits.set(key, hits)
  return hits.length > 20
}

export default async function authRoutes(app) {
  const { sql } = app

  app.get('/config', async () => ({ openRegistration: config.openRegistration }))

  app.get('/invite/:code', async (req) => {
    const inv = await findInvite(sql, req.params.code)
    return { valid: Boolean(inv) }
  })

  app.post('/register', async (req, reply) => {
    const b = req.body || {}
    const email = normEmail(b.email)
    const firstName = str(b.firstName, { required: true, max: 100, name: 'Имя' }).trim()
    const lastName = str(b.lastName, { required: true, max: 100, name: 'Фамилия' }).trim()
    if (!validEmail(email)) fail(400, 'Проверьте email')
    const pwErr = validatePassword(b.password)
    if (pwErr) fail(400, pwErr)

    const invite = await findInvite(sql, b.invite)
    if (b.invite && !invite) fail(400, 'Ссылка-приглашение недействительна или устарела')
    if (!invite && !config.openRegistration) fail(403, 'Регистрация только по приглашению')

    const hash = await hashPassword(b.password)
    const user = await sql.begin(async (tx) => {
      const [exists] = await tx`SELECT 1 FROM users WHERE email = ${email}`
      if (exists) fail(409, 'Пользователь с таким email уже зарегистрирован')
      const [u] = await tx`
        INSERT INTO users (email, password_hash, first_name, last_name, role, invite_id)
        VALUES (${email}, ${hash}, ${firstName}, ${lastName}, ${invite?.role ?? 'student'}, ${invite?.id ?? null})
        RETURNING *`
      if (invite) {
        await tx`UPDATE invites SET uses = uses + 1 WHERE id = ${invite.id}`
        for (const cid of invite.course_ids) {
          await tx`INSERT INTO enrollments (user_id, course_id) SELECT ${u.id}, id FROM courses WHERE id = ${cid} ON CONFLICT DO NOTHING`
        }
      }
      return u
    })
    setSessionCookie(reply, await createSession(sql, user.id))
    return { user: publicUser(user) }
  })

  app.post('/login', async (req, reply) => {
    const email = normEmail(req.body?.email)
    if (tooManyAttempts(`${req.ip}|${email}`)) fail(429, 'Слишком много попыток, подождите 15 минут')
    const [u] = await sql`SELECT * FROM users WHERE email = ${email}`
    const ok = u && (await verifyPassword(String(req.body?.password ?? ''), u.password_hash))
    if (!ok) fail(401, 'Неверный email или пароль')
    if (u.blocked) fail(403, 'Аккаунт заблокирован')
    setSessionCookie(reply, await createSession(sql, u.id))
    return { user: publicUser(u) }
  })

  app.post('/logout', async (req, reply) => {
    const token = req.cookies[COOKIE]
    if (token) await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`
    reply.clearCookie(COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/me', async (req) => ({ user: publicUser(req.user) }))

  app.post('/password', { preHandler: app.requireUser }, async (req) => {
    const { oldPassword, newPassword } = req.body || {}
    if (!(await verifyPassword(String(oldPassword ?? ''), req.user.password_hash))) fail(400, 'Неверный текущий пароль')
    const pwErr = validatePassword(newPassword)
    if (pwErr) fail(400, pwErr)
    await sql`UPDATE users SET password_hash = ${await hashPassword(newPassword)} WHERE id = ${req.user.id}`
    // выходим на всех остальных устройствах
    await sql`DELETE FROM sessions WHERE user_id = ${req.user.id} AND token_hash <> ${sha256(req.cookies[COOKIE])}`
    return { ok: true }
  })
}
