import { fail, str, toInt } from '../../lib/http.js'
import { normalizeParts } from '../../lib/tasks.js'

export const adminTask = (t) => ({
  id: t.id,
  code: t.code,
  title: t.title,
  text: t.text,
  parts: t.parts,
  hints: t.hints,
  solution: t.solution,
  xp: t.xp,
  topic: t.topic,
  tags: t.tags,
  difficulty: t.difficulty,
  source: t.source,
  note: t.note,
  archived: t.archived,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
  lessons: t.lessons ?? undefined,
  stats:
    t.st_started === undefined
      ? undefined
      : {
          started: t.st_started,
          solved: t.st_solved,
          failed: t.st_failed ?? undefined,
          avgAttempts: t.st_avg_attempts ?? undefined,
          avgHints: t.st_avg_hints ?? undefined,
        },
})

function taskPatch(b) {
  const p = {}
  if (b.title !== undefined) p.title = str(b.title, { required: true, max: 300, name: 'Название' }).trim()
  if (b.code !== undefined) p.code = b.code ? str(b.code, { max: 50, name: 'Код' }).trim() || null : null
  if (b.text !== undefined) p.text = str(b.text, { max: 50000, name: 'Условие' })
  if (b.solution !== undefined) p.solution = str(b.solution, { max: 50000, name: 'Решение' })
  if (b.topic !== undefined) p.topic = str(b.topic, { max: 200, name: 'Тема' }).trim()
  if (b.source !== undefined) p.source = str(b.source, { max: 500, name: 'Источник' })
  if (b.note !== undefined) p.note = str(b.note, { max: 5000, name: 'Заметка' })
  if (b.archived !== undefined) p.archived = Boolean(b.archived)
  if (b.xp !== undefined) p.xp = b.xp === null || b.xp === '' ? null : toInt(b.xp)
  if (b.difficulty !== undefined) {
    p.difficulty = b.difficulty === null || b.difficulty === '' ? null : Number(b.difficulty)
    if (p.difficulty !== null && !(Number.isInteger(p.difficulty) && p.difficulty >= 1 && p.difficulty <= 5)) {
      fail(400, 'Сложность: от 1 до 5')
    }
  }
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags)) fail(400, 'Теги: ожидается список')
    p.tags = [...new Set(b.tags.map((s) => String(s).trim()).filter(Boolean))].slice(0, 50)
  }
  if (b.hints !== undefined) {
    if (!Array.isArray(b.hints)) fail(400, 'Подсказки: ожидается список')
    p.hints = b.hints.map((h) => String(h)).filter((h) => h.trim())
  }
  if (b.parts !== undefined) {
    try {
      p.parts = normalizeParts(b.parts)
    } catch (e) {
      fail(400, e.message)
    }
  }
  return p
}

export default async function adminTasks(app) {
  const { sql } = app

  // Списки тем и тегов для фильтров и подсказок ввода
  app.get('/tasks/meta', async () => {
    const topics = await sql`SELECT topic, count(*)::int AS n FROM tasks WHERE topic <> '' GROUP BY topic ORDER BY topic`
    const tags = await sql`SELECT tag, count(*)::int AS n FROM tasks, unnest(tags) AS tag GROUP BY tag ORDER BY tag`
    return { topics, tags }
  })

  // Банк задач со статистикой и списком уроков, где задача используется
  app.get('/tasks', async (req) => {
    const q = String(req.query.q ?? '').trim()
    const topic = String(req.query.topic ?? '')
    const tag = String(req.query.tag ?? '')
    const archived = req.query.archived === 'true'
    const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`
    const qId = /^\d+$/.test(q) ? Number(q) : -1
    const rows = await sql`
      SELECT t.*,
        coalesce((
          SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'courseId', l.course_id) ORDER BY l.course_id, l.position)
          FROM lesson_tasks lt JOIN lessons l ON l.id = lt.lesson_id WHERE lt.task_id = t.id
        ), '[]') AS lessons,
        s.started AS st_started, s.solved AS st_solved, s.failed AS st_failed,
        s.avg_attempts AS st_avg_attempts, s.avg_hints AS st_avg_hints
      FROM tasks t
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS started,
          count(*) FILTER (WHERE status = 'correct')::int AS solved,
          count(*) FILTER (WHERE status IN ('wrong', 'skipped'))::int AS failed,
          round(avg(attempts) FILTER (WHERE status <> 'pending'), 2)::float AS avg_attempts,
          round(avg(hints_used), 2)::float AS avg_hints
        FROM progress p WHERE p.task_id = t.id
      ) s ON true
      WHERE t.archived = ${archived}
        AND (${q} = '' OR t.id = ${qId} OR t.title ILIKE ${like} OR t.text ILIKE ${like} OR t.code ILIKE ${like} OR t.note ILIKE ${like})
        AND (${topic} = '' OR t.topic = ${topic})
        AND (${tag} = '' OR ${tag} = ANY(t.tags))
      ORDER BY t.id DESC`
    return { tasks: rows.map(adminTask) }
  })

  app.get('/tasks/:id', async (req) => {
    const [t] = await sql`SELECT * FROM tasks WHERE id = ${toInt(req.params.id)}`
    if (!t) fail(404, 'Задача не найдена')
    return { task: adminTask(t) }
  })

  app.post('/tasks', async (req) => {
    const p = taskPatch({ parts: [{ label: '', answer: 0, tolerance: 0 }], ...req.body })
    if (!p.title) fail(400, 'Название: обязательно')
    try {
      const [t] = await sql`INSERT INTO tasks ${sql({ ...p, parts: sql.json(p.parts), hints: sql.json(p.hints ?? []), created_by: req.user.id })} RETURNING *`
      return { task: adminTask(t) }
    } catch (e) {
      if (e.code === '23505') fail(409, 'Задача с таким кодом уже есть')
      throw e
    }
  })

  app.patch('/tasks/:id', async (req) => {
    const p = taskPatch(req.body || {})
    if (p.parts) p.parts = sql.json(p.parts)
    if (p.hints) p.hints = sql.json(p.hints)
    try {
      const [t] = await sql`UPDATE tasks SET ${sql({ ...p, updated_at: new Date() })} WHERE id = ${toInt(req.params.id)} RETURNING *`
      if (!t) fail(404, 'Задача не найдена')
      return { task: adminTask(t) }
    } catch (e) {
      if (e.code === '23505') fail(409, 'Задача с таким кодом уже есть')
      throw e
    }
  })

  app.post('/tasks/:id/duplicate', async (req) => {
    const [t] = await sql`
      INSERT INTO tasks (title, text, parts, hints, solution, xp, topic, tags, difficulty, source, note, created_by)
      SELECT title || ' (копия)', text, parts, hints, solution, xp, topic, tags, difficulty, source, note, ${req.user.id}
      FROM tasks WHERE id = ${toInt(req.params.id)} RETURNING *`
    if (!t) fail(404, 'Задача не найдена')
    return { task: adminTask(t) }
  })

  // Удалить можно только задачу, которая не стоит ни в одном уроке и которую никто не решал.
  // Иначе — архивировать (archived: true).
  app.delete('/tasks/:id', async (req) => {
    const id = toInt(req.params.id)
    const [used] = await sql`SELECT count(*)::int AS n FROM lesson_tasks WHERE task_id = ${id}`
    if (used.n) fail(409, 'Задача стоит в уроках — сначала уберите её оттуда или отправьте в архив')
    const [done] = await sql`SELECT count(*)::int AS n FROM progress WHERE task_id = ${id}`
    if (done.n) fail(409, 'Эту задачу уже решали ученики — её можно только отправить в архив')
    await sql`DELETE FROM tasks WHERE id = ${id}`
    return { ok: true }
  })
}
