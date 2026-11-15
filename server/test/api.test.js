// Тесты API на настоящей базе PostgreSQL.
// База берётся из TEST_DATABASE_URL и ПОЛНОСТЬЮ очищается перед запуском.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db.js'
import { migrate } from '../src/migrate.js'
import { buildApp } from '../src/app.js'
import { ensureAdmin, seedCourse } from '../src/seed.js'
import { course, lessons } from '../../src/data/course.js'

const url = process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/edu_test'
let sql, app

before(async () => {
  sql = createDb(url)
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await migrate(sql, () => {})
  await seedCourse(sql, course, lessons, () => {})
  await ensureAdmin(sql, { email: 'admin@test.ru', password: 'adminadmin' }, () => {})
  app = await buildApp({ sql })
})
after(async () => {
  await app.close()
  await sql.end()
})

// Мини-клиент, который хранит cookie сессии
function client() {
  let cookie = ''
  const call = async (method, url, body) => {
    const res = await app.inject({ method, url, payload: body, headers: cookie ? { cookie } : {} })
    const set = res.headers['set-cookie']
    if (set) cookie = [].concat(set).map((c) => c.split(';')[0]).join('; ')
    return { status: res.statusCode, body: res.json() }
  }
  return {
    get: (u) => call('GET', u),
    post: (u, b = {}) => call('POST', u, b),
    patch: (u, b) => call('PATCH', u, b),
    put: (u, b) => call('PUT', u, b),
    del: (u) => call('DELETE', u),
  }
}

async function register(email, extra = {}) {
  const c = client()
  const r = await c.post('/api/auth/register', { email, password: 'password1', firstName: 'Иван', lastName: 'Петров', ...extra })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return { c, user: r.body.user }
}

async function admin() {
  const c = client()
  const r = await c.post('/api/auth/login', { email: 'admin@test.ru', password: 'adminadmin' })
  assert.equal(r.status, 200)
  return c
}

const firstLesson = async (c) => {
  const { body } = await c.get('/api/courses')
  const courseId = body.courses[0].id
  const { body: cb } = await c.get(`/api/courses/${courseId}`)
  return { courseId, lessons: cb.lessons }
}

describe('авторизация', () => {
  test('регистрация, вход, выход', async () => {
    const { c, user } = await register('Student1@Test.ru')
    assert.equal(user.email, 'student1@test.ru')
    assert.equal(user.role, 'student')
    assert.equal((await c.get('/api/auth/me')).body.user.id, user.id)
    await c.post('/api/auth/logout')
    assert.equal((await c.get('/api/auth/me')).body.user, null)
    assert.equal((await c.post('/api/auth/login', { email: 'student1@test.ru', password: 'wrong' })).status, 401)
    assert.equal((await c.post('/api/auth/login', { email: 'student1@test.ru', password: 'password1' })).status, 200)
  })

  test('повторный email и короткий пароль отклоняются', async () => {
    const c = client()
    assert.equal((await c.post('/api/auth/register', { email: 'student1@test.ru', password: 'password1', firstName: 'А', lastName: 'Б' })).status, 409)
    assert.equal((await c.post('/api/auth/register', { email: 'x@test.ru', password: '123', firstName: 'А', lastName: 'Б' })).status, 400)
  })

  test('без входа API закрыт, ученику админка недоступна', async () => {
    assert.equal((await client().get('/api/courses')).status, 401)
    const { c } = await register('student2@test.ru')
    assert.equal((await c.get('/api/admin/users')).status, 403)
  })
})

describe('решение задач', () => {
  test('ответы скрыты до завершения, XP по правилам', async () => {
    const { c } = await register('solver@test.ru')
    const { lessons: ls } = await firstLesson(c)
    const free = ls.find((l) => !l.locked)
    const { body } = await c.get(`/api/lessons/${free.id}`)
    const t = body.tasks[0]
    assert.equal(t.parts[0].answer, null)
    assert.equal(t.solution, null)
    assert.ok(!JSON.stringify(body).includes('"tolerance"'))

    let r = await c.post(`/api/lessons/${free.id}/tasks/${t.id}/check`, { answers: ['1'] })
    assert.equal(r.body.correct, false)
    assert.equal(r.body.task.state.attempts, 1)
    assert.equal(r.body.task.potentialXp, 12) // 20 × 0.6

    r = await c.post(`/api/lessons/${free.id}/tasks/${t.id}/hint`)
    assert.equal(r.body.task.hints.length, 1)

    r = await c.post(`/api/lessons/${free.id}/tasks/${t.id}/check`, { answers: ['8'] })
    assert.equal(r.body.correct, true)
    assert.equal(r.body.task.state.status, 'correct')
    // 20 × (1 − 1/3) × 0.6 = 8
    assert.equal(r.body.task.state.xp, 8)
    assert.ok(r.body.task.solution)

    r = await c.post(`/api/lessons/${free.id}/tasks/${t.id}/check`, { answers: ['8'] })
    assert.equal(r.status, 400)
  })

  test('«Я не знаю» — 0 XP и показ решения', async () => {
    const { c } = await register('skipper@test.ru')
    const { lessons: ls } = await firstLesson(c)
    const free = ls.find((l) => !l.locked)
    const { body } = await c.get(`/api/lessons/${free.id}`)
    const r = await c.post(`/api/lessons/${free.id}/tasks/${body.tasks[1].id}/skip`)
    assert.equal(r.body.task.state.status, 'skipped')
    assert.equal(r.body.task.state.xp, 0)
    assert.ok(r.body.task.parts[0].answer !== null)
  })

  test('платный урок закрыт без записи на курс', async () => {
    const a = await admin()
    const { body: tree } = await a.get('/api/admin/courses')
    const paid = tree.courses[0].lessons.at(-1)
    await a.patch(`/api/admin/lessons/${paid.id}`, { free: false })
    const { c, user } = await register('locked@test.ru')
    const { courseId, lessons: ls } = await firstLesson(c)
    assert.equal(ls.find((l) => l.id === paid.id).locked, true)
    assert.equal((await c.get(`/api/lessons/${paid.id}`)).status, 403)
    await a.put(`/api/admin/users/${user.id}/enrollments`, { courseIds: [courseId] })
    assert.equal((await c.get(`/api/lessons/${paid.id}`)).status, 200)
  })
})

describe('админка', () => {
  test('приглашение: метка и запись на курс', async () => {
    const a = await admin()
    const { courseId } = await firstLesson(a)
    const { body } = await a.post('/api/admin/invites', { label: '10А, школа 57', courseIds: [courseId], maxUses: 1 })
    const code = body.invite.code
    assert.equal((await client().get(`/api/auth/invite/${code}`)).body.valid, true)
    const { user } = await register('invited@test.ru', { invite: code })
    const { body: users } = await a.get('/api/admin/users')
    const u = users.users.find((x) => x.id === user.id)
    assert.equal(u.invite.label, '10А, школа 57')
    assert.deepEqual(u.courseIds, [courseId])
    // лимит использований исчерпан
    const r = await client().post('/api/auth/register', { email: 'inv2@test.ru', password: 'password1', firstName: 'А', lastName: 'Б', invite: code })
    assert.equal(r.status, 400)
  })

  test('приглашение для уже зарегистрированного: открывает курс и добавляет метку', async () => {
    const a = await admin()
    const { courseId } = await firstLesson(a)
    const { c, user } = await register('existing@test.ru')
    const { body } = await a.post('/api/admin/invites', { label: 'Олимп. группа', note: 'с собрания 14.11', courseIds: [courseId] })
    const code = body.invite.code

    const info = await c.get(`/api/auth/invite/${code}`)
    assert.equal(info.body.courses[0].id, courseId)
    assert.equal((await c.post(`/api/auth/invite/${code}/accept`)).status, 200)
    assert.equal((await c.post(`/api/auth/invite/${code}/accept`)).status, 200) // повтор — без ошибок

    const { body: d } = await a.get(`/api/admin/users/${user.id}`)
    assert.deepEqual(d.user.courseIds, [courseId])
    assert.equal(d.user.invites.length, 1)
    assert.equal(d.user.invites[0].note, 'с собрания 14.11')
    const { body: inv } = await a.get('/api/admin/invites')
    const row = inv.invites.find((i) => i.code === code)
    assert.equal(row.uses, 1)
    assert.equal(row.users, 1)
    assert.equal((await client().post(`/api/auth/invite/${code}/accept`)).status, 401)
  })

  test('ручная запись на курс со стороны курса', async () => {
    const a = await admin()
    const { courseId } = await firstLesson(a)
    const { user } = await register('manual@test.ru')
    await a.post(`/api/admin/courses/${courseId}/students`, { userIds: [user.id] })
    let { body } = await a.get(`/api/admin/courses/${courseId}/students`)
    assert.ok(body.students.some((s) => s.id === user.id))
    await a.del(`/api/admin/courses/${courseId}/students/${user.id}`)
    ;({ body } = await a.get(`/api/admin/courses/${courseId}/students`))
    assert.ok(!body.students.some((s) => s.id === user.id))
  })

  test('комментарий и смена email', async () => {
    const a = await admin()
    const { user } = await register('typo@tset.ru')
    assert.equal((await a.patch(`/api/admin/users/${user.id}`, { note: 'брат Маши', email: 'typo@test.ru' })).status, 200)
    assert.equal((await a.patch(`/api/admin/users/${user.id}`, { email: 'solver@test.ru' })).status, 409)
    const { body } = await a.get(`/api/admin/users/${user.id}`)
    assert.equal(body.user.note, 'брат Маши')
    assert.equal(body.user.email, 'typo@test.ru')
  })

  test('объединение аккаунтов сохраняет лучший результат', async () => {
    const a = await admin()
    const { c: c1, user: main } = await register('main@test.ru')
    const { c: c2, user: dup } = await register('dup@test.ru', { firstName: 'Ваня' })
    const { lessons: ls } = await firstLesson(c1)
    const free = ls.find((l) => !l.locked)
    const { body } = await c1.get(`/api/lessons/${free.id}`)
    const [t1, t2] = body.tasks
    await c1.post(`/api/lessons/${free.id}/tasks/${t1.id}/skip`) // в основном — не засчитано
    await c2.post(`/api/lessons/${free.id}/tasks/${t1.id}/check`, { answers: ['8'] }) // в дубле — решено
    await c2.post(`/api/lessons/${free.id}/tasks/${t2.id}/check`, { answers: ['-6'] })

    const r = await a.post(`/api/admin/users/${main.id}/merge`, { fromId: dup.id })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.moved, 1)
    assert.equal(r.body.replaced, 1)

    const { body: d } = await a.get(`/api/admin/users/${main.id}`)
    assert.equal(d.progress.filter((p) => p.status === 'correct').length, 2)
    assert.ok(d.user.note.includes('dup@test.ru'))
    assert.equal((await a.get(`/api/admin/users/${dup.id}`)).status, 404)
    // дубль больше не может войти
    assert.equal((await c2.get('/api/auth/me')).body.user, null)
  })

  test('банк задач и состав урока', async () => {
    const a = await admin()
    let r = await a.post('/api/admin/tasks', { title: 'Новая', text: 'Найдите $x$', parts: [{ label: 'x', answer: '2,5', tolerance: '0.1' }], hints: ['h1', ' '], tags: ['кинематика', 'кинематика'] })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    const task = r.body.task
    assert.deepEqual(task.parts, [{ label: 'x', answer: 2.5, tolerance: 0.1 }])
    assert.deepEqual(task.hints, ['h1'])
    assert.deepEqual(task.tags, ['кинематика'])
    assert.equal((await a.post('/api/admin/tasks', { title: 'x', parts: [{ answer: 'abc' }] })).status, 400)

    const { body: tree } = await a.get('/api/admin/courses')
    const lesson = tree.courses[0].lessons[0]
    const { body: lb } = await a.get(`/api/admin/lessons/${lesson.id}`)
    const ids = [task.id, ...lb.tasks.map((t) => t.id).reverse()]
    assert.equal((await a.put(`/api/admin/lessons/${lesson.id}/tasks`, { taskIds: ids })).status, 200)
    const { body: lb2 } = await a.get(`/api/admin/lessons/${lesson.id}`)
    assert.deepEqual(lb2.tasks.map((t) => t.id), ids)

    // задачу, стоящую в уроке, удалить нельзя
    assert.equal((await a.del(`/api/admin/tasks/${task.id}`)).status, 409)
    const { body: list } = await a.get('/api/admin/tasks?q=Новая')
    assert.equal(list.tasks.length, 1)
    assert.equal(list.tasks[0].lessons[0].id, lesson.id)
  })

  test('сводная таблица курса', async () => {
    const a = await admin()
    const { courseId } = await firstLesson(a)
    const { body } = await a.get(`/api/admin/courses/${courseId}/matrix`)
    assert.ok(body.lessons.length > 0)
    const s = body.students.find((x) => x.email === 'main@test.ru')
    assert.equal(s.solved, 2)
    const { body: o } = await a.get('/api/admin/stats/overview')
    assert.equal(o.daily.length, 30)
  })
})
