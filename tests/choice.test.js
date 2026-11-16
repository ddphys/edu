import { describe, expect, it } from 'vitest'
import { createLocalApi } from '../src/api/local.js'
import { memoryFiles } from '../src/api/files.js'
import { memoryKv } from '../src/api/progress.js'
import { mergeCourse, splitCourse } from '../src/content/format.js'
import { validateContent } from '../src/content/validate.js'
import { courseTasks } from '../src/lib.js'
import { checkContentDir } from '../scripts/content-fs.js'
import { sampleContent, sourceOf } from './helpers.js'

// Образцовый курс с двумя задачами на выбор: один верный вариант и несколько
function content(change = () => {}) {
  const c = sampleContent()
  c.courses[0].lessons[0].tasks.push(
    {
      id: 'c1',
      type: 'choice',
      level: 3,
      title: 'Один вариант',
      text: 'Во сколько раз?',
      options: ['В 2 раза', 'В $4$ раза', 'В 8 раз', 'Не изменится'],
      correct: [1],
      hints: ['Подсказка'],
      solution: 'Разбор выбора',
    },
    {
      id: 'c2',
      type: 'choice',
      level: 3,
      title: 'Несколько вариантов',
      text: 'Отметьте верные',
      options: ['Первое', 'Второе', 'Третье'],
      multiple: true,
      correct: [0, 2],
      attach: true,
      rubric: ['Есть объяснение'],
    },
  )
  change(c.courses[0].lessons[0].tasks)
  return c
}
function setup(change) {
  const clock = { now: 1000 }
  const api = createLocalApi({ source: sourceOf(content(change)), kv: memoryKv(), files: memoryFiles(), now: () => clock.now })
  return { api, clock, submit: (id, input) => api.submitAnswer('demo', id, input) }
}
const messages = (issues) => issues.map((i) => i.message).join('\n')

describe('выбор варианта: формат', () => {
  it('варианты — в открытой части, верные номера и критерии — в закрытой', () => {
    const { course, answers } = splitCourse(content().courses[0])
    const [c1, c2] = courseTasks(course).slice(-2)
    expect(c1).toEqual({ id: 'c1', type: 'choice', level: 3, title: 'Один вариант', text: 'Во сколько раз?', options: ['В 2 раза', 'В $4$ раза', 'В 8 раз', 'Не изменится'], hintCount: 1 })
    expect(c2).toMatchObject({ multiple: true, attach: true })
    expect(JSON.stringify(course)).not.toMatch(/"correct"|"rubric"|Есть объяснение/)
    expect(answers.tasks.c1).toEqual({ correct: [1], hints: ['Подсказка'], solution: 'Разбор выбора' })
    expect(answers.tasks.c2).toEqual({ correct: [0, 2], rubric: ['Есть объяснение'] })
  })

  it('разрезать и собрать обратно — тот же курс', () => {
    const full = content().courses[0]
    const { course, answers } = splitCourse(full)
    expect(mergeCourse(course, answers)).toEqual(full)
  })
})

describe('выбор варианта: проверка корректности', () => {
  const issuesAfter = (change) => validateContent(content(change))
  const c1 = (tasks) => tasks.at(-2)

  it('хорошие задачи без замечаний', () => {
    expect(validateContent(content())).toEqual([])
  })

  it('нет верного варианта, номер вне списка, мало вариантов, пустой вариант', () => {
    expect(messages(issuesAfter((t) => (c1(t).correct = [])))).toMatch(/Не отмечен верный вариант/)
    expect(messages(issuesAfter((t) => delete c1(t).correct))).toMatch(/Не отмечен верный вариант/)
    expect(messages(issuesAfter((t) => (c1(t).correct = [4])))).toMatch(/вне списка: вариантов всего 4/)
    expect(messages(issuesAfter((t) => (c1(t).options = ['Один'])))).toMatch(/хотя бы два варианта/)
    expect(messages(issuesAfter((t) => (c1(t).options[2] = ' ')))).toMatch(/Вариант 3 пустой/)
  })

  it('несколько верных без признака «несколько» — ошибка', () => {
    const issues = issuesAfter((t) => (c1(t).correct = [0, 1]))
    expect(messages(issues)).toMatch(/включите «Несколько верных»/)
    expect(issues[0].path).toBe('courses/0/lessons/0/tasks/2/correct')
  })

  it('формулы и картинки в вариантах проверяются', () => {
    expect(messages(issuesAfter((t) => (c1(t).options[0] = '![](net.png)')))).toMatch(/Картинки «net.png» нет в курсе/)
    expect(messages(issuesAfter((t) => (c1(t).options[0] = '$\\frac{1$')))).toMatch(/Вариант 1: ошибка в формуле/)
  })
})

describe('выбор одного варианта: те же правила XP', () => {
  it('верно с первого раза — полная цена, открываются разбор и верный вариант', async () => {
    const { api, submit } = setup()
    expect((await api.getRevealed('demo', ['c1'])).c1.answer).toBeNull()
    const r = await submit('c1', [1])
    expect(r.kind).toBe('correct')
    expect(r.state).toMatchObject({ status: 'correct', xp: 20, answers: [1] })
    expect(r.revealed).toMatchObject({ solution: 'Разбор выбора', answer: { correct: [1] } })
  })

  it('ничего не выбрано — не ошибка', async () => {
    const { submit } = setup()
    expect(await submit('c1', [])).toMatchObject({ kind: 'invalid', message: 'Выберите вариант ответа' })
    expect((await submit('c1', [7])).kind).toBe('invalid')
  })

  it('ошибка −20%, проверенный вариант повторно не выбирается', async () => {
    const { submit } = setup()
    const wrong = await submit('c1', [0])
    expect(wrong).toMatchObject({ kind: 'wrong', note: 'Неверно', xpLost: 4 })
    expect(wrong.state).toMatchObject({ errors: 1, tried: [0] })
    expect(wrong.revealed.answer).toBeNull()

    const again = await submit('c1', [0])
    expect(again.kind).toBe('invalid')
    expect(again.state.errors).toBe(1)
    expect((await submit('c1', [1])).state.xp).toBe(16)
  })

  it('с 3-й ошибки пауза; перебором нельзя получить меньше 25% и больше, чем осталось', async () => {
    const { submit, clock } = setup()
    await submit('c1', [0])
    await submit('c1', [2])
    const third = await submit('c1', [3])
    expect(third.state).toMatchObject({ errors: 3, tried: [0, 2, 3], lockUntil: clock.now + 20_000 })
    expect((await submit('c1', [1])).kind).toBe('locked')
    clock.now += 21_000
    // 20 − 3·4 = 8
    expect((await submit('c1', [1])).state.xp).toBe(8)
  })

  it('подсказка и «Я не знаю» работают так же, как у числа', async () => {
    const { api, submit } = setup()
    const hint = await api.takeHint('demo', 'c1')
    expect(hint.revealed.hints).toEqual(['Подсказка'])
    expect((await submit('c1', [1])).state.xp).toBe(15)

    const other = setup().api
    const skipped = await other.skipTask('demo', 'c1')
    expect(skipped.state).toMatchObject({ status: 'skipped', xp: 0, answers: [] })
    expect(skipped.revealed.answer).toEqual({ correct: [1] })
  })
})

describe('выбор нескольких вариантов', () => {
  it('засчитывается только точный набор, порядок отметок не важен', async () => {
    const { submit } = setup()
    expect((await submit('c2', [0])).kind).toBe('wrong')
    expect((await submit('c2', [0, 1, 2])).kind).toBe('wrong')
    const ok = await submit('c2', [2, 0])
    expect(ok.state).toMatchObject({ status: 'correct', errors: 2, answers: [0, 2], xp: 20 - 8 })
  })

  it('после ошибки не сообщается, какие варианты неверны', async () => {
    const { submit } = setup()
    const wrong = await submit('c2', [0, 1])
    expect(wrong.note).toBe('Неверно')
    expect(wrong.state.tried).toBeUndefined()
    expect(wrong.revealed.answer).toBeNull()
    // тот же набор можно отправить снова — это снова ошибка
    expect((await submit('c2', [0, 1])).state.errors).toBe(2)
  })

  it('ничего не отмечено — не ошибка', async () => {
    const { submit } = setup()
    expect(await submit('c2', [])).toMatchObject({ kind: 'invalid', message: 'Отметьте хотя бы один вариант' })
  })
})

describe('фото решения', () => {
  const photo = (name = 'решение.jpg') => new Blob(['фото'], { type: 'image/jpeg' }) && Object.assign(new Blob(['фото'], { type: 'image/jpeg' }), { name })

  it('ученик может приложить и убрать фото; на XP и состояние задачи это не влияет', async () => {
    const { api } = setup()
    expect((await api.getViewer()).features.attachSolution).toBe(true)
    expect(await api.listAttachments('demo', 'c2')).toEqual([])
    const list = await api.addAttachment('demo', 'c2', photo())
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'решение.jpg', size: 8 })
    expect(await api.listAttachments('demo', 'c1')).toEqual([])
    expect((await api.getProgress()).courses).toEqual({})
    expect(await api.removeAttachment('demo', 'c2', list[0].id)).toEqual([])
  })

  it('не картинка и шестое фото отклоняются с понятным сообщением', async () => {
    const { api } = setup()
    await expect(api.addAttachment('demo', 'c2', new Blob(['x'], { type: 'application/pdf' }))).rejects.toThrow(/только фотографию/)
    for (let i = 0; i < 5; i++) await api.addAttachment('demo', 'c2', photo(`${i}.jpg`))
    await expect(api.addAttachment('demo', 'c2', photo())).rejects.toThrow(/не больше 5 фото/)
  })

  it('без хранилища файлов возможность выключена', async () => {
    const api = createLocalApi({ source: sourceOf(content()), kv: memoryKv() })
    expect((await api.getViewer()).features.attachSolution).toBe(false)
  })
})

describe('демо-курс в опубликованном контенте', () => {
  const { content: published } = checkContentDir()
  const demo = published.courses.find((c) => c.id === 'demo')
  const api = () => createLocalApi({ source: sourceOf(published), kv: memoryKv(), now: () => 0 })

  it('есть задачи обоих типов, с несколькими полями, с картинками и с фото решения', () => {
    const tasks = courseTasks(demo)
    expect(new Set(tasks.map((t) => t.type))).toEqual(new Set(['number', 'choice']))
    expect(tasks.some((t) => t.parts)).toBe(true)
    expect(tasks.some((t) => t.multiple)).toBe(true)
    expect(tasks.some((t) => t.attach && t.rubric?.length)).toBe(true)
    expect(tasks.some((t) => /!\[/.test(t.text))).toBe(true)
    expect(tasks.some((t) => t.options?.some((o) => /!\[/.test(o)))).toBe(true)
  })

  it('записанные ответы принимаются', async () => {
    const a = api()
    const answers = {
      'throw-time': ['2'],
      'throw-height-range': ['5', '34,6'],
      'throw-double-speed': [3],
      'throw-graph': [1],
      'throw-statements': [0, 2, 3],
      tower: ['2,3'],
      'incline-acc': ['5'],
      'incline-mass': [2],
    }
    expect(Object.keys(answers)).toEqual(courseTasks(demo).map((t) => t.id))
    for (const [id, input] of Object.entries(answers)) expect((await a.submitAnswer('demo', id, input)).kind, id).toBe('correct')
  })
})
