import { isStaff } from '../lib/auth.js'
import { fail, toInt } from '../lib/http.js'
import { checkAnswer, emptyState, studentTask } from '../lib/tasks.js'

const courseView = (c) => ({
  id: c.id,
  slug: c.slug,
  title: c.title,
  badge: c.badge,
  about: c.about,
  teacher: { name: c.teacher_name, photo: c.teacher_photo },
})

async function canSeeCourse(sql, user, course) {
  if (isStaff(user)) return true
  return course.published
}

async function isEnrolled(sql, user, courseId) {
  if (isStaff(user)) return true
  const [e] = await sql`SELECT 1 FROM enrollments WHERE user_id = ${user.id} AND course_id = ${courseId}`
  return Boolean(e)
}

// Урок с курсом и проверкой доступа
export async function loadLesson(sql, user, lessonId) {
  const [lesson] = await sql`SELECT * FROM lessons WHERE id = ${lessonId}`
  if (!lesson) fail(404, 'Урок не найден')
  const [course] = await sql`SELECT * FROM courses WHERE id = ${lesson.course_id}`
  if (!(await canSeeCourse(sql, user, course)) || (!lesson.published && !isStaff(user))) fail(404, 'Урок не найден')
  if (!lesson.free && !(await isEnrolled(sql, user, course.id))) fail(403, 'Урок доступен после записи на курс')
  return { lesson, course }
}

export default async function studentRoutes(app) {
  const { sql } = app
  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api/admin')) await app.requireUser(req)
  })

  app.get('/courses', async (req) => {
    const staff = isStaff(req.user)
    const rows = await sql`
      SELECT c.*, EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.user_id = ${req.user.id}) AS enrolled
      FROM courses c WHERE ${staff} OR c.published ORDER BY c.position, c.id`
    return { courses: rows.map((c) => ({ ...courseView(c), enrolled: c.enrolled || staff })) }
  })

  app.get('/courses/:id', async (req) => {
    const id = toInt(req.params.id)
    const [course] = await sql`SELECT * FROM courses WHERE id = ${id}`
    if (!course || !(await canSeeCourse(sql, req.user, course))) fail(404, 'Курс не найден')
    const enrolled = await isEnrolled(sql, req.user, id)
    const staff = isStaff(req.user)
    const lessons = await sql`
      SELECT l.id, l.title, l.free, l.published,
        count(lt.task_id)::int AS task_count,
        count(p.task_id) FILTER (WHERE p.status = 'correct')::int AS solved,
        coalesce(sum(p.xp), 0)::int AS xp
      FROM lessons l
      LEFT JOIN lesson_tasks lt ON lt.lesson_id = l.id
      LEFT JOIN progress p ON p.task_id = lt.task_id AND p.user_id = ${req.user.id}
      WHERE l.course_id = ${id} AND (${staff} OR l.published)
      GROUP BY l.id ORDER BY l.position, l.id`
    // XP по курсу: каждая задача считается один раз, даже если она в нескольких уроках
    const [{ xp }] = await sql`
      SELECT coalesce(sum(p.xp), 0)::int AS xp FROM progress p
      WHERE p.user_id = ${req.user.id}
        AND p.task_id IN (SELECT lt.task_id FROM lesson_tasks lt JOIN lessons l ON l.id = lt.lesson_id WHERE l.course_id = ${id})`
    return {
      course: { ...courseView(course), enrolled },
      totalXp: xp,
      lessons: lessons.map((l) => ({
        id: l.id,
        title: l.title,
        free: l.free,
        published: l.published,
        locked: !l.free && !enrolled,
        taskCount: l.task_count,
        solved: l.solved,
        xp: l.xp,
      })),
    }
  })

  app.get('/lessons/:id', async (req) => {
    const { lesson, course } = await loadLesson(sql, req.user, toInt(req.params.id))
    const tasks = await sql`
      SELECT t.*, p.status, p.attempts, p.hints_used, p.answers, p.ok_parts, p.xp AS p_xp
      FROM lesson_tasks lt JOIN tasks t ON t.id = lt.task_id
      LEFT JOIN progress p ON p.task_id = t.id AND p.user_id = ${req.user.id}
      WHERE lt.lesson_id = ${lesson.id} ORDER BY lt.position, t.id`
    return {
      lesson: {
        id: lesson.id,
        courseId: course.id,
        title: lesson.title,
        description: lesson.description.split('\n').map((s) => s.trim()).filter(Boolean),
        videoUrl: lesson.video_url,
        videoVertical: lesson.video_vertical,
        free: lesson.free,
      },
      tasks: tasks.map((t) => studentTask(t, course, rowState(t))),
    }
  })

  // Общая обёртка для действий с задачей: блокируем строку прогресса на время изменения
  async function withTask(req, fn) {
    const { lesson, course } = await loadLesson(sql, req.user, toInt(req.params.lessonId))
    const taskId = toInt(req.params.taskId)
    const [task] = await sql`
      SELECT t.* FROM lesson_tasks lt JOIN tasks t ON t.id = lt.task_id
      WHERE lt.lesson_id = ${lesson.id} AND lt.task_id = ${taskId}`
    if (!task) fail(404, 'Задача не найдена')
    return sql.begin(async (tx) => {
      await tx`INSERT INTO progress (user_id, task_id) VALUES (${req.user.id}, ${task.id}) ON CONFLICT DO NOTHING`
      const [row] = await tx`SELECT * FROM progress WHERE user_id = ${req.user.id} AND task_id = ${task.id} FOR UPDATE`
      const result = await fn({ tx, task, course, state: rowState(row) })
      const s = result.state
      await tx`
        UPDATE progress SET status = ${s.status}, attempts = ${s.attempts}, hints_used = ${s.hints_used},
          answers = ${tx.json(s.answers)}, ok_parts = ${tx.json(s.ok_parts)}, xp = ${s.xp}, updated_at = now()
        WHERE user_id = ${req.user.id} AND task_id = ${task.id}`
      return { ...result.extra, task: studentTask(task, course, s) }
    })
  }

  app.post('/lessons/:lessonId/tasks/:taskId/check', async (req) =>
    withTask(req, async ({ tx, task, course, state }) => {
      const r = checkAnswer(task, course, state, req.body?.answers)
      if (r.error) fail(400, r.error)
      await tx`INSERT INTO task_events (user_id, task_id, kind, answers, correct)
        VALUES (${req.user.id}, ${task.id}, 'attempt', ${tx.json(r.input)}, ${r.correct})`
      return {
        state: r.state,
        extra: { correct: r.correct, wrongCount: r.wrongCount, attemptsLeft: r.attemptsLeft, nextXp: r.nextXp },
      }
    }),
  )

  app.post('/lessons/:lessonId/tasks/:taskId/hint', async (req) =>
    withTask(req, async ({ tx, task, state }) => {
      if (state.status !== 'pending') fail(400, 'Задача уже завершена')
      if (state.hints_used >= task.hints.length) fail(400, 'Подсказки закончились')
      await tx`INSERT INTO task_events (user_id, task_id, kind) VALUES (${req.user.id}, ${task.id}, 'hint')`
      return { state: { ...state, hints_used: state.hints_used + 1 } }
    }),
  )

  app.post('/lessons/:lessonId/tasks/:taskId/skip', async (req) =>
    withTask(req, async ({ tx, task, state }) => {
      if (state.status !== 'pending') fail(400, 'Задача уже завершена')
      await tx`INSERT INTO task_events (user_id, task_id, kind) VALUES (${req.user.id}, ${task.id}, 'skip')`
      return { state: { ...state, status: 'skipped', xp: 0 } }
    }),
  )
}

function rowState(r) {
  if (!r?.status) return emptyState()
  return {
    status: r.status,
    attempts: r.attempts,
    hints_used: r.hints_used,
    answers: r.answers,
    ok_parts: r.ok_parts,
    xp: r.p_xp ?? r.xp,
  }
}
