// Первичное заполнение базы:
//  1) переносит курс из src/data/course.js (если курса с таким id ещё нет);
//  2) создаёт администратора из ADMIN_EMAIL / ADMIN_PASSWORD (если такого пользователя ещё нет).
//
// Запуск: npm run seed   (в папке server, переменные — в server/.env)
import { createDb } from './db.js'
import { migrate } from './migrate.js'
import { hashPassword, normEmail, validatePassword } from './lib/auth.js'
import { normalizeParts } from './lib/tasks.js'

export async function seedCourse(sql, course, lessons, log = console.log) {
  const [exists] = await sql`SELECT id FROM courses WHERE slug = ${course.id}`
  if (exists) {
    log(`курс «${course.id}» уже есть в базе — пропускаю`)
    return exists.id
  }
  return sql.begin(async (tx) => {
    const [c] = await tx`
      INSERT INTO courses (slug, title, badge, about, teacher_name, teacher_photo, default_task_xp, attempt_multipliers, published, position)
      VALUES (${course.id}, ${course.title}, ${course.badge ?? ''}, ${course.about ?? ''}, ${course.teacher?.name ?? ''},
        ${course.teacher?.photo ?? ''}, ${course.defaultTaskXp ?? 20}, ${course.attemptMultipliers ?? [1, 0.6, 0.4, 0.3, 0.25]}, true, 1)
      RETURNING id`
    for (const [li, l] of lessons.entries()) {
      const [lesson] = await tx`
        INSERT INTO lessons (course_id, title, description, video_url, video_vertical, free, published, position)
        VALUES (${c.id}, ${l.title}, ${(l.description ?? []).join('\n')}, ${l.videoUrl ?? ''}, ${Boolean(l.videoVertical)},
          ${Boolean(l.free)}, true, ${li + 1})
        RETURNING id`
      for (const [ti, t] of l.tasks.entries()) {
        const parts = normalizeParts(t.parts ?? [{ label: '', answer: t.answer, tolerance: t.tolerance }])
        const [task] = await tx`
          INSERT INTO tasks (code, title, text, parts, hints, solution, xp, topic)
          VALUES (${t.id}, ${t.title}, ${t.text}, ${tx.json(parts)}, ${tx.json(t.hints ?? [])}, ${t.solution ?? ''}, ${t.xp ?? null}, ${l.title})
          ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
          RETURNING id`
        await tx`INSERT INTO lesson_tasks (lesson_id, task_id, position) VALUES (${lesson.id}, ${task.id}, ${ti + 1})`
      }
    }
    log(`курс «${course.title}» перенесён: уроков ${lessons.length}`)
    return c.id
  })
}

export async function ensureAdmin(sql, { email, password, firstName = 'Админ', lastName = '' }, log = console.log) {
  email = normEmail(email)
  const [u] = await sql`SELECT id, role FROM users WHERE email = ${email}`
  if (u) {
    if (u.role !== 'admin') await sql`UPDATE users SET role = 'admin' WHERE id = ${u.id}`
    log(`администратор ${email} уже есть`)
    return u.id
  }
  const err = validatePassword(password)
  if (err) throw new Error(`ADMIN_PASSWORD: ${err}`)
  const [n] = await sql`
    INSERT INTO users (email, password_hash, first_name, last_name, role)
    VALUES (${email}, ${await hashPassword(password)}, ${firstName}, ${lastName}, 'admin') RETURNING id`
  log(`создан администратор ${email}`)
  return n.id
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sql = createDb()
  await migrate(sql)
  const { course, lessons } = await import('../../src/data/course.js')
  await seedCourse(sql, course, lessons)
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await ensureAdmin(sql, {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      firstName: process.env.ADMIN_FIRST_NAME || 'Админ',
      lastName: process.env.ADMIN_LAST_NAME || '',
    })
  } else {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD не заданы — администратор не создан')
  }
  await sql.end()
}
