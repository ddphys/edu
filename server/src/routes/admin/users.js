import { hashPassword, normEmail, randomToken, validEmail, validatePassword } from '../../lib/auth.js'
import { fail, intList, str, toInt } from '../../lib/http.js'

const RANK = { correct: 3, wrong: 1, skipped: 1, pending: 0 }

// Какая из двух записей прогресса по одной задаче «лучше» — её и оставляем при объединении
export function betterProgress(a, b) {
  if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] > RANK[b.status] ? a : b
  if (a.xp !== b.xp) return a.xp > b.xp ? a : b
  if (a.attempts !== b.attempts) return a.attempts > b.attempts ? a : b
  return a.updated_at >= b.updated_at ? a : b
}

const userRow = (u) => ({
  id: u.id,
  email: u.email,
  firstName: u.first_name,
  lastName: u.last_name,
  role: u.role,
  note: u.note,
  blocked: u.blocked,
  createdAt: u.created_at,
  lastSeenAt: u.last_seen_at,
  invite: u.invite_id ? { id: u.invite_id, label: u.invite_label } : null,
  courseIds: u.course_ids ?? [],
  xp: u.xp ?? 0,
  solved: u.solved ?? 0,
  failed: u.failed ?? 0,
  started: u.started ?? 0,
  attempts: u.attempts ?? 0,
  lastActivityAt: u.last_activity_at ?? null,
})

export default async function adminUsers(app) {
  const { sql } = app

  // ---------- Пользователи ----------
  app.get('/users', async () => {
    const rows = await sql`
      SELECT u.*, i.label AS invite_label,
        coalesce((SELECT array_agg(course_id ORDER BY course_id) FROM enrollments e WHERE e.user_id = u.id), '{}') AS course_ids,
        p.xp, p.solved, p.failed, p.started, p.last_activity_at,
        (SELECT count(*)::int FROM task_events ev WHERE ev.user_id = u.id AND ev.kind = 'attempt') AS attempts
      FROM users u
      LEFT JOIN invites i ON i.id = u.invite_id
      LEFT JOIN LATERAL (
        SELECT sum(xp)::int AS xp,
          count(*) FILTER (WHERE status = 'correct')::int AS solved,
          count(*) FILTER (WHERE status IN ('wrong', 'skipped'))::int AS failed,
          count(*)::int AS started,
          max(updated_at) AS last_activity_at
        FROM progress WHERE user_id = u.id
      ) p ON true
      ORDER BY u.created_at DESC`
    return { users: rows.map(userRow) }
  })

  app.get('/users/:id', async (req) => {
    const id = toInt(req.params.id)
    const [u] = await sql`
      SELECT u.*, i.label AS invite_label,
        coalesce((SELECT array_agg(course_id) FROM enrollments e WHERE e.user_id = u.id), '{}') AS course_ids
      FROM users u LEFT JOIN invites i ON i.id = u.invite_id WHERE u.id = ${id}`
    if (!u) fail(404, 'Пользователь не найден')
    const progress = await sql`
      SELECT p.*, t.title, t.code,
        (SELECT array_agg(DISTINCT l.title) FROM lesson_tasks lt JOIN lessons l ON l.id = lt.lesson_id WHERE lt.task_id = t.id) AS lessons
      FROM progress p JOIN tasks t ON t.id = p.task_id
      WHERE p.user_id = ${id} ORDER BY p.updated_at DESC`
    const events = await sql`
      SELECT ev.id, ev.task_id, ev.kind, ev.answers, ev.correct, ev.created_at, t.title
      FROM task_events ev JOIN tasks t ON t.id = ev.task_id
      WHERE ev.user_id = ${id} ORDER BY ev.created_at DESC LIMIT 300`
    return {
      user: userRow(u),
      progress: progress.map((p) => ({
        taskId: p.task_id,
        title: p.title,
        code: p.code,
        lessons: p.lessons ?? [],
        status: p.status,
        attempts: p.attempts,
        hintsUsed: p.hints_used,
        answers: p.answers,
        xp: p.xp,
        startedAt: p.started_at,
        updatedAt: p.updated_at,
      })),
      events: events.map((e) => ({
        id: e.id,
        taskId: e.task_id,
        title: e.title,
        kind: e.kind,
        answers: e.answers,
        correct: e.correct,
        at: e.created_at,
      })),
    }
  })

  app.patch('/users/:id', async (req) => {
    const id = toInt(req.params.id)
    const b = req.body || {}
    const [u] = await sql`SELECT * FROM users WHERE id = ${id}`
    if (!u) fail(404, 'Пользователь не найден')
    const patch = {}
    if (b.note !== undefined) patch.note = str(b.note, { max: 5000, name: 'Комментарий' })
    if (b.firstName !== undefined) patch.first_name = str(b.firstName, { required: true, max: 100, name: 'Имя' }).trim()
    if (b.lastName !== undefined) patch.last_name = str(b.lastName, { required: true, max: 100, name: 'Фамилия' }).trim()
    if (b.email !== undefined) {
      const email = normEmail(b.email)
      if (!validEmail(email)) fail(400, 'Проверьте email')
      const [other] = await sql`SELECT id FROM users WHERE email = ${email} AND id <> ${id}`
      if (other) fail(409, `Этот email уже у пользователя #${other.id} — объедините аккаунты`)
      patch.email = email
    }
    if (b.blocked !== undefined) {
      if (id === req.user.id) fail(400, 'Нельзя заблокировать себя')
      patch.blocked = Boolean(b.blocked)
    }
    if (b.role !== undefined) {
      if (req.user.role !== 'admin') fail(403, 'Только для администратора')
      if (!['admin', 'teacher', 'student'].includes(b.role)) fail(400, 'Неизвестная роль')
      if (id === req.user.id && b.role !== 'admin') fail(400, 'Нельзя снять роль администратора с себя')
      patch.role = b.role
    }
    if (Object.keys(patch).length) await sql`UPDATE users SET ${sql(patch)} WHERE id = ${id}`
    if (patch.blocked) await sql`DELETE FROM sessions WHERE user_id = ${id}`
    return { ok: true }
  })

  // Админ задаёт новый пароль (или генерирует случайный) — пока нет восстановления по почте
  app.post('/users/:id/password', { preHandler: app.requireAdmin }, async (req) => {
    const id = toInt(req.params.id)
    const password = req.body?.password || randomToken(6)
    const err = validatePassword(password)
    if (err) fail(400, err)
    const r = await sql`UPDATE users SET password_hash = ${await hashPassword(password)} WHERE id = ${id}`
    if (!r.count) fail(404, 'Пользователь не найден')
    await sql`DELETE FROM sessions WHERE user_id = ${id}`
    return { password }
  })

  app.put('/users/:id/enrollments', async (req) => {
    const id = toInt(req.params.id)
    const courseIds = intList(req.body?.courseIds ?? [], 'Курсы')
    await sql.begin(async (tx) => {
      await tx`DELETE FROM enrollments WHERE user_id = ${id} AND NOT (course_id = ANY(${courseIds}))`
      for (const cid of courseIds) {
        await tx`INSERT INTO enrollments (user_id, course_id) VALUES (${id}, ${cid}) ON CONFLICT DO NOTHING`
      }
    })
    return { ok: true }
  })

  // Сброс прогресса ученика: по одной задаче или целиком
  app.post('/users/:id/reset', async (req) => {
    const id = toInt(req.params.id)
    const taskId = req.body?.taskId ? toInt(req.body.taskId) : null
    await sql.begin(async (tx) => {
      const rows = taskId
        ? await tx`DELETE FROM progress WHERE user_id = ${id} AND task_id = ${taskId} RETURNING task_id`
        : await tx`DELETE FROM progress WHERE user_id = ${id} RETURNING task_id`
      for (const r of rows) {
        await tx`INSERT INTO task_events (user_id, task_id, kind) VALUES (${id}, ${r.task_id}, 'reset')`
      }
    })
    return { ok: true }
  })

  // Объединение аккаунтов: всё из fromId переносится в :id, затем fromId удаляется
  app.post('/users/:id/merge', { preHandler: app.requireAdmin }, async (req) => {
    const intoId = toInt(req.params.id)
    const fromId = toInt(req.body?.fromId)
    if (intoId === fromId) fail(400, 'Выберите другой аккаунт')
    const result = await sql.begin(async (tx) => {
      const users = await tx`SELECT * FROM users WHERE id IN (${intoId}, ${fromId}) FOR UPDATE`
      const into = users.find((u) => u.id === intoId)
      const from = users.find((u) => u.id === fromId)
      if (!into || !from) fail(404, 'Пользователь не найден')
      if (from.role === 'admin') fail(400, 'Нельзя удалить аккаунт администратора объединением')

      let moved = 0
      let replaced = 0
      const fromRows = await tx`SELECT * FROM progress WHERE user_id = ${fromId}`
      for (const fr of fromRows) {
        const [ir] = await tx`SELECT * FROM progress WHERE user_id = ${intoId} AND task_id = ${fr.task_id}`
        if (!ir) {
          await tx`UPDATE progress SET user_id = ${intoId} WHERE user_id = ${fromId} AND task_id = ${fr.task_id}`
          moved++
        } else if (betterProgress(ir, fr) === fr) {
          await tx`
            UPDATE progress SET status = ${fr.status}, attempts = ${fr.attempts}, hints_used = ${fr.hints_used},
              answers = ${tx.json(fr.answers)}, ok_parts = ${tx.json(fr.ok_parts)}, xp = ${fr.xp},
              started_at = least(started_at, ${fr.started_at}), updated_at = ${fr.updated_at}
            WHERE user_id = ${intoId} AND task_id = ${fr.task_id}`
          replaced++
        }
      }
      await tx`UPDATE task_events SET user_id = ${intoId} WHERE user_id = ${fromId}`
      await tx`
        INSERT INTO enrollments (user_id, course_id, created_at)
        SELECT ${intoId}, course_id, created_at FROM enrollments WHERE user_id = ${fromId}
        ON CONFLICT DO NOTHING`
      await tx`UPDATE invites SET created_by = ${intoId} WHERE created_by = ${fromId}`
      await tx`UPDATE tasks SET created_by = ${intoId} WHERE created_by = ${fromId}`

      const stamp = new Date().toISOString().slice(0, 10)
      const line = `[${stamp}] Объединён с аккаунтом #${from.id} ${from.last_name} ${from.first_name} <${from.email}>${from.note ? ': ' + from.note : ''}`
      await tx`
        UPDATE users SET
          note = ${into.note ? into.note + '\n' + line : line},
          invite_id = coalesce(invite_id, ${from.invite_id}),
          created_at = least(created_at, ${from.created_at})
        WHERE id = ${intoId}`
      await tx`DELETE FROM users WHERE id = ${fromId}`
      return { moved, replaced, kept: fromRows.length - moved - replaced }
    })
    return { ok: true, ...result }
  })

  app.delete('/users/:id', { preHandler: app.requireAdmin }, async (req) => {
    const id = toInt(req.params.id)
    if (id === req.user.id) fail(400, 'Нельзя удалить себя')
    await sql`DELETE FROM users WHERE id = ${id}`
    return { ok: true }
  })

  // ---------- Приглашения ----------
  const inviteRow = (i) => ({
    id: i.id,
    code: i.code,
    label: i.label,
    note: i.note,
    role: i.role,
    courseIds: i.course_ids,
    maxUses: i.max_uses,
    uses: i.uses,
    expiresAt: i.expires_at,
    disabled: i.disabled,
    createdAt: i.created_at,
    users: i.users ?? 0,
  })

  function invitePatch(b) {
    const p = {}
    if (b.label !== undefined) p.label = str(b.label, { required: true, max: 200, name: 'Метка' }).trim()
    if (b.note !== undefined) p.note = str(b.note, { max: 5000, name: 'Заметка' })
    if (b.courseIds !== undefined) p.course_ids = intList(b.courseIds, 'Курсы')
    if (b.maxUses !== undefined) p.max_uses = b.maxUses === null || b.maxUses === '' ? null : toInt(b.maxUses)
    if (b.expiresAt !== undefined) {
      p.expires_at = b.expiresAt ? new Date(b.expiresAt) : null
      if (p.expires_at && isNaN(p.expires_at)) fail(400, 'Неверная дата')
    }
    if (b.disabled !== undefined) p.disabled = Boolean(b.disabled)
    return p
  }

  app.get('/invites', async () => {
    const rows = await sql`
      SELECT i.*, (SELECT count(*)::int FROM users u WHERE u.invite_id = i.id) AS users
      FROM invites i ORDER BY i.created_at DESC`
    return { invites: rows.map(inviteRow) }
  })

  app.post('/invites', async (req) => {
    const p = invitePatch(req.body || {})
    if (!p.label) fail(400, 'Метка: обязательно')
    const [i] = await sql`
      INSERT INTO invites ${sql({ ...p, code: randomToken(9), created_by: req.user.id })} RETURNING *`
    return { invite: inviteRow(i) }
  })

  app.patch('/invites/:id', async (req) => {
    const p = invitePatch(req.body || {})
    if (!Object.keys(p).length) return { ok: true }
    const [i] = await sql`UPDATE invites SET ${sql(p)} WHERE id = ${toInt(req.params.id)} RETURNING *`
    if (!i) fail(404, 'Приглашение не найдено')
    return { invite: inviteRow(i) }
  })
}
