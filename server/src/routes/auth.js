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

// Записать, что пользователь воспользовался приглашением, и открыть ему курсы из приглашения.
// Повторное использование той же ссылки тем же человеком ничего не меняет.
async function applyInvite(tx, invite, userId) {
  const [used] = await tx`
    INSERT INTO invite_uses (invite_id, user_id) VALUES (${invite.id}, ${userId})
    ON CONFLICT DO NOTHING RETURNING invite_id`
  if (used) await tx`UPDATE invites SET uses = uses + 1 WHERE id = ${invite.id}`
  for (const cid of invite.course_ids) {
    await tx`INSERT INTO enrollments (user_id, course_id) SELECT ${userId}, id FROM courses WHERE id = ${cid} ON CONFLICT DO NOTHING`
  }
  return Boolean(used)
}

const inviteCourses = (sql, invite) =>
  sql`SELECT id, title FROM courses WHERE id = ANY(${invite.course_ids}) ORDER BY position, id`

export default async function authRoutes(app) {
  const { sql } = app

  app.get('/config', async () => ({ openRegistration: config.openRegistration }))

  app.get('/invite/:code', async (req) => {
    const inv = await findInvite(sql, req.params.code)
    // уже воспользовавшийся ссылкой человек может открыть её снова, даже если лимит исчерпан
    const [own] = req.user
      ? await sql`SELECT i.* FROM invites i JOIN invite_uses u ON u.invite_id = i.id WHERE i.code = ${String(req.params.code)} AND u.user_id = ${req.user.id}`
      : []
    const invite = inv || own
    if (!invite) return { valid: false }
    return { valid: true, used: Boolean(own), courses: await inviteCourses(sql, invite) }
  })

  // Приглашение для уже зарегистрированного пользователя: открывает курсы из ссылки
  app.post('/invite/:code/accept', { preHandler: app.requireUser }, async (req) => {
    const invite = await findInvite(sql, req.params.code)
    if (!invite) {
      const [own] = await sql`SELECT i.* FROM invites i JOIN invite_uses u ON u.invite_id = i.id WHERE i.code = ${String(req.params.code)} AND u.user_id = ${req.user.id}`
      if (own) return { ok: true, courses: await inviteCourses(sql, own) }
      fail(400, 'Ссылка-приглашение недействительна или устарела')
    }
    await sql.begin(async (tx) => {
      await applyInvite(tx, invite, req.user.id)
      await tx`UPDATE users SET invite_id = coalesce(invite_id, ${invite.id}) WHERE id = ${req.user.id}`
    })
    return { ok: true, courses: await inviteCourses(sql, invite) }
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
      if (invite) await applyInvite(tx, invite, u.id)
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
