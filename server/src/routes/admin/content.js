import { fail, intList, str, toInt } from '../../lib/http.js'
import { adminTask } from './tasks.js'

const courseRow = (c) => ({
  id: c.id,
  slug: c.slug,
  title: c.title,
  badge: c.badge,
  about: c.about,
  teacherName: c.teacher_name,
  teacherPhoto: c.teacher_photo,
  defaultTaskXp: c.default_task_xp,
  attemptMultipliers: c.attempt_multipliers,
  published: c.published,
  position: c.position,
})

const lessonRow = (l) => ({
  id: l.id,
  courseId: l.course_id,
  title: l.title,
  description: l.description,
  videoUrl: l.video_url,
  videoVertical: l.video_vertical,
  free: l.free,
  published: l.published,
  position: l.position,
  taskCount: l.task_count ?? undefined,
})

function coursePatch(b) {
  const p = {}
  if (b.title !== undefined) p.title = str(b.title, { required: true, max: 300, name: 'Название' }).trim()
  if (b.slug !== undefined) {
    p.slug = str(b.slug, { required: true, max: 100, name: 'Адрес' }).trim()
    if (!/^[a-z0-9-]+$/.test(p.slug)) fail(400, 'Адрес курса: только латиница, цифры и дефис')
  }
  for (const [k, col, max] of [
    ['badge', 'badge', 300],
    ['about', 'about', 20000],
    ['teacherName', 'teacher_name', 200],
    ['teacherPhoto', 'teacher_photo', 1000],
  ]) {
    if (b[k] !== undefined) p[col] = str(b[k], { max, name: k })
  }
  if (b.defaultTaskXp !== undefined) p.default_task_xp = toInt(b.defaultTaskXp)
  if (b.attemptMultipliers !== undefined) {
    const m = b.attemptMultipliers
    if (!Array.isArray(m) || !m.length || m.some((x) => !(Number(x) > 0 && Number(x) <= 1))) {
      fail(400, 'Шкала попыток: числа от 0 до 1')
    }
    p.attempt_multipliers = m.map(Number)
  }
  if (b.published !== undefined) p.published = Boolean(b.published)
  return p
}

function lessonPatch(b) {
  const p = {}
  if (b.title !== undefined) p.title = str(b.title, { required: true, max: 300, name: 'Название' }).trim()
  if (b.description !== undefined) p.description = str(b.description, { max: 20000, name: 'Описание' })
  if (b.videoUrl !== undefined) p.video_url = str(b.videoUrl, { max: 1000, name: 'Видео' }).trim()
  if (b.videoVertical !== undefined) p.video_vertical = Boolean(b.videoVertical)
  if (b.free !== undefined) p.free = Boolean(b.free)
  if (b.published !== undefined) p.published = Boolean(b.published)
  return p
}

export default async function adminContent(app) {
  const { sql } = app

  // Дерево: курсы → уроки (с числом задач)
  app.get('/courses', async () => {
    const courses = await sql`SELECT * FROM courses ORDER BY position, id`
    const lessons = await sql`
      SELECT l.*, (SELECT count(*)::int FROM lesson_tasks lt WHERE lt.lesson_id = l.id) AS task_count
      FROM lessons l ORDER BY position, id`
    return {
      courses: courses.map((c) => ({
        ...courseRow(c),
        lessons: lessons.filter((l) => l.course_id === c.id).map(lessonRow),
      })),
    }
  })

  app.post('/courses', async (req) => {
    const p = coursePatch({ published: false, ...req.body })
    if (!p.title) fail(400, 'Название: обязательно')
    p.slug ??= `course-${Date.now().toString(36)}`
    const [{ max }] = await sql`SELECT coalesce(max(position), 0) AS max FROM courses`
    const [c] = await sql`INSERT INTO courses ${sql({ ...p, position: max + 1 })} RETURNING *`
    return { course: courseRow(c) }
  })

  app.patch('/courses/:id', async (req) => {
    const p = coursePatch(req.body || {})
    if (!Object.keys(p).length) return { ok: true }
    const [c] = await sql`UPDATE courses SET ${sql(p)} WHERE id = ${toInt(req.params.id)} RETURNING *`
    if (!c) fail(404, 'Курс не найден')
    return { course: courseRow(c) }
  })

  // Удаление курса удаляет его уроки, но задачи остаются в банке
  app.delete('/courses/:id', { preHandler: app.requireAdmin }, async (req) => {
    await sql`DELETE FROM courses WHERE id = ${toInt(req.params.id)}`
    return { ok: true }
  })

  app.put('/courses/order', async (req) => {
    const ids = intList(req.body?.ids, 'Курсы')
    await sql.begin(async (tx) => {
      for (const [i, id] of ids.entries()) await tx`UPDATE courses SET position = ${i + 1} WHERE id = ${id}`
    })
    return { ok: true }
  })

  app.put('/courses/:id/lessons/order', async (req) => {
    const courseId = toInt(req.params.id)
    const ids = intList(req.body?.ids, 'Уроки')
    await sql.begin(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx`UPDATE lessons SET position = ${i + 1}, course_id = ${courseId} WHERE id = ${id}`
      }
    })
    return { ok: true }
  })

  // ---------- Уроки ----------
  app.post('/lessons', async (req) => {
    const courseId = toInt(req.body?.courseId)
    const p = lessonPatch({ published: false, ...req.body })
    if (!p.title) fail(400, 'Название: обязательно')
    const [{ max }] = await sql`SELECT coalesce(max(position), 0) AS max FROM lessons WHERE course_id = ${courseId}`
    const [l] = await sql`INSERT INTO lessons ${sql({ ...p, course_id: courseId, position: max + 1 })} RETURNING *`
    return { lesson: lessonRow(l) }
  })

  app.get('/lessons/:id', async (req) => {
    const id = toInt(req.params.id)
    const [l] = await sql`SELECT * FROM lessons WHERE id = ${id}`
    if (!l) fail(404, 'Урок не найден')
    const tasks = await sql`
      SELECT t.*, lt.position,
        (SELECT count(*)::int FROM progress p WHERE p.task_id = t.id) AS st_started,
        (SELECT count(*)::int FROM progress p WHERE p.task_id = t.id AND p.status = 'correct') AS st_solved
      FROM lesson_tasks lt JOIN tasks t ON t.id = lt.task_id
      WHERE lt.lesson_id = ${id} ORDER BY lt.position, t.id`
    return { lesson: lessonRow(l), tasks: tasks.map(adminTask) }
  })

  app.patch('/lessons/:id', async (req) => {
    const p = lessonPatch(req.body || {})
    if (req.body?.courseId !== undefined) p.course_id = toInt(req.body.courseId)
    if (!Object.keys(p).length) return { ok: true }
    const [l] = await sql`UPDATE lessons SET ${sql(p)} WHERE id = ${toInt(req.params.id)} RETURNING *`
    if (!l) fail(404, 'Урок не найден')
    return { lesson: lessonRow(l) }
  })

  app.delete('/lessons/:id', async (req) => {
    await sql`DELETE FROM lessons WHERE id = ${toInt(req.params.id)}`
    return { ok: true }
  })

  app.post('/lessons/:id/duplicate', async (req) => {
    const id = toInt(req.params.id)
    const lesson = await sql.begin(async (tx) => {
      const [l] = await tx`SELECT * FROM lessons WHERE id = ${id}`
      if (!l) fail(404, 'Урок не найден')
      const [n] = await tx`
        INSERT INTO lessons (course_id, title, description, video_url, video_vertical, free, published, position)
        VALUES (${l.course_id}, ${l.title + ' (копия)'}, ${l.description}, ${l.video_url}, ${l.video_vertical}, ${l.free}, false, ${l.position})
        RETURNING *`
      await tx`INSERT INTO lesson_tasks (lesson_id, task_id, position) SELECT ${n.id}, task_id, position FROM lesson_tasks WHERE lesson_id = ${id}`
      return n
    })
    return { lesson: lessonRow(lesson) }
  })

  // Состав урока целиком: упорядоченный список задач (для перетаскивания)
  app.put('/lessons/:id/tasks', async (req) => {
    const id = toInt(req.params.id)
    const taskIds = intList(req.body?.taskIds, 'Задачи')
    if (new Set(taskIds).size !== taskIds.length) fail(400, 'Задача добавлена в урок дважды')
    await sql.begin(async (tx) => {
      const [l] = await tx`SELECT id FROM lessons WHERE id = ${id} FOR UPDATE`
      if (!l) fail(404, 'Урок не найден')
      await tx`DELETE FROM lesson_tasks WHERE lesson_id = ${id}`
      for (const [i, tid] of taskIds.entries()) {
        await tx`INSERT INTO lesson_tasks (lesson_id, task_id, position) VALUES (${id}, ${tid}, ${i + 1})`
      }
    })
    return { ok: true }
  })
}
