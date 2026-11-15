import { fail, toInt } from '../../lib/http.js'

export default async function adminStats(app) {
  const { sql } = app

  app.get('/stats/overview', async () => {
    const [counts] = await sql`
      SELECT
        count(*) FILTER (WHERE role = 'student')::int AS students,
        count(*) FILTER (WHERE role = 'student' AND created_at > now() - interval '7 days')::int AS new_week,
        count(*) FILTER (WHERE role = 'student' AND last_seen_at > now() - interval '7 days')::int AS active_week,
        count(*) FILTER (WHERE role = 'student' AND last_seen_at > now() - interval '1 day')::int AS active_day
      FROM users`
    const [tasks] = await sql`
      SELECT (SELECT count(*)::int FROM tasks WHERE NOT archived) AS tasks,
        (SELECT count(*)::int FROM progress WHERE status = 'correct') AS solved,
        (SELECT count(*)::int FROM task_events WHERE kind = 'attempt') AS attempts`
    const daily = await sql`
      SELECT d::date AS day,
        count(e.id) FILTER (WHERE e.kind = 'attempt')::int AS attempts,
        count(e.id) FILTER (WHERE e.kind = 'attempt' AND e.correct)::int AS correct,
        count(DISTINCT e.user_id)::int AS users
      FROM generate_series(current_date - 29, current_date, interval '1 day') d
      LEFT JOIN task_events e ON e.created_at >= d AND e.created_at < d + interval '1 day'
      GROUP BY d ORDER BY d`
    return { ...counts, ...tasks, daily }
  })

  // Сводная таблица курса: ученики × задачи
  app.get('/courses/:id/matrix', async (req) => {
    const courseId = toInt(req.params.id)
    const [course] = await sql`SELECT id, title FROM courses WHERE id = ${courseId}`
    if (!course) fail(404, 'Курс не найден')
    const cols = await sql`
      SELECT l.id AS lesson_id, l.title AS lesson_title, t.id AS task_id, t.title, t.code
      FROM lessons l JOIN lesson_tasks lt ON lt.lesson_id = l.id JOIN tasks t ON t.id = lt.task_id
      WHERE l.course_id = ${courseId} ORDER BY l.position, l.id, lt.position`
    const taskIds = [...new Set(cols.map((c) => c.task_id))]
    const students = await sql`
      SELECT u.id, u.first_name, u.last_name, u.email, u.note, i.label AS invite_label, u.last_seen_at,
        EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id AND e.course_id = ${courseId}) AS enrolled
      FROM users u LEFT JOIN invites i ON i.id = u.invite_id
      WHERE u.role = 'student' AND (
        EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id AND e.course_id = ${courseId})
        OR EXISTS (SELECT 1 FROM progress p WHERE p.user_id = u.id AND p.task_id = ANY(${taskIds}))
      )
      ORDER BY u.last_name, u.first_name`
    const cells = await sql`
      SELECT user_id, task_id, status, attempts, hints_used, xp, updated_at
      FROM progress WHERE task_id = ANY(${taskIds})`

    const lessons = []
    for (const c of cols) {
      let l = lessons.find((x) => x.id === c.lesson_id)
      if (!l) lessons.push((l = { id: c.lesson_id, title: c.lesson_title, tasks: [] }))
      l.tasks.push({ id: c.task_id, title: c.title, code: c.code })
    }
    const byUser = {}
    for (const c of cells) {
      ;(byUser[c.user_id] ??= {})[c.task_id] = {
        s: c.status,
        a: c.attempts,
        h: c.hints_used,
        xp: c.xp,
        at: c.updated_at,
      }
    }
    return {
      course,
      lessons,
      students: students.map((s) => {
        const row = byUser[s.id] || {}
        const vals = taskIds.map((id) => row[id]).filter(Boolean)
        return {
          id: s.id,
          name: `${s.last_name} ${s.first_name}`,
          email: s.email,
          note: s.note,
          label: s.invite_label,
          enrolled: s.enrolled,
          lastSeenAt: s.last_seen_at,
          xp: vals.reduce((a, v) => a + v.xp, 0),
          solved: vals.filter((v) => v.s === 'correct').length,
          cells: row,
        }
      }),
    }
  })
}
