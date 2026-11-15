import { describe, expect, it } from 'vitest'
import { createLocalApi } from '../src/api/local.js'
import { KEY_V2, memoryKv } from '../src/api/progress.js'
import { sampleContent, sourceOf } from './helpers.js'

// Локальный api поверх образцового курса; время управляется вручную
function setup(courseOverrides) {
  const kv = memoryKv()
  const clock = { now: 1_000_000 }
  const api = createLocalApi({ source: sourceOf(sampleContent(courseOverrides)), kv, now: () => clock.now })
  const submit = (id, input) => api.submitAnswer('demo', id, input)
  return { api, kv, clock, submit }
}

describe('задача с числом: правила из README', () => {
  it('верный ответ с первого раза — полная цена', async () => {
    const { submit } = setup()
    const r = await submit('t1', ['8'])
    expect(r.kind).toBe('correct')
    expect(r.state).toMatchObject({ status: 'correct', errors: 0, hintsUsed: 0, xp: 20, answers: ['8'], okParts: [true] })
    expect(r.revealed.solution).toBe('Разбор $x = 8$')
    expect(r.revealed.answer.parts).toEqual(['8'])
  })

  it('до ответа ученику не отдаются ни разбор, ни верный ответ', async () => {
    const { api } = setup()
    const { t1 } = await api.getRevealed('demo', ['t1'])
    expect(t1).toEqual({ hints: [], solution: null, answer: { parts: [null] } })
    const content = await api.getContent()
    expect(JSON.stringify(content)).not.toMatch(/"answer"|"solution"|"hints"|"correct"|"explain"/)
  })

  it('ошибка −20% цены, подсказка −25%; штрафы вычитаются', async () => {
    const { api, submit } = setup()
    const wrong = await submit('t1', ['7'])
    expect(wrong).toMatchObject({ kind: 'wrong', note: 'Неверно', xpLost: 4 })
    expect(wrong.state).toMatchObject({ status: 'pending', errors: 1, lockUntil: 0 })

    const hint = await api.takeHint('demo', 't1')
    expect(hint.kind).toBe('hint')
    expect(hint.revealed.hints).toEqual(['Первая'])
    expect(hint.revealed.solution).toBeNull()

    const ok = await submit('t1', ['8'])
    expect(ok.state.xp).toBe(20 - 4 - 5)
  })

  it('не число — не ошибка: XP не снимается, состояние не меняется', async () => {
    const { api, submit } = setup()
    const r = await submit('t1', ['8 м/с'])
    expect(r.kind).toBe('invalid')
    expect(r.message).toMatch(/Ответ должен быть числом/)
    expect((await submit('t1', [''])).message).toBe('Введите ответ')
    expect((await api.getProgress()).courses).toEqual({})
    expect((await submit('t1', [' 8,0 '])).state.xp).toBe(20)
  })

  it('решил сам — не меньше 25% цены, сколько бы ни было ошибок', async () => {
    const { submit, clock } = setup()
    for (let i = 0; i < 6; i++) {
      await submit('t1', ['0'])
      clock.now += 60_000
    }
    const ok = await submit('t1', ['8'])
    expect(ok.state).toMatchObject({ status: 'correct', errors: 6, xp: 5 })
  })

  it('с 3-й ошибки после каждой неверной отправки пауза 20 секунд', async () => {
    const { submit, clock } = setup()
    expect((await submit('t1', ['1'])).state.lockUntil).toBe(0)
    expect((await submit('t1', ['2'])).state.lockUntil).toBe(0)
    const third = await submit('t1', ['3'])
    expect(third.state.lockUntil).toBe(clock.now + 20_000)

    // Во время паузы ответ не принимается и ошибкой не считается — даже верный
    clock.now += 19_000
    const locked = await submit('t1', ['8'])
    expect(locked.kind).toBe('locked')
    expect(locked.state.errors).toBe(3)

    clock.now += 2_000
    const fourth = await submit('t1', ['4'])
    expect(fourth.state).toMatchObject({ errors: 4, lockUntil: clock.now + 20_000 })
    clock.now += 20_000
    expect((await submit('t1', ['8'])).state).toMatchObject({ status: 'correct', lockUntil: 0 })
  })

  it('«Я не знаю» — 0 XP, открывается разбор и ответ; дальше задача не меняется', async () => {
    const { api, submit } = setup()
    await api.takeHint('demo', 't1')
    const r = await api.skipTask('demo', 't1')
    expect(r.state).toMatchObject({ status: 'skipped', xp: 0, hintsUsed: 1, answers: [''] })
    expect(r.revealed.solution).toBe('Разбор $x = 8$')
    expect(r.revealed.answer.parts).toEqual(['8'])
    expect((await submit('t1', ['8'])).kind).toBe('noop')
    expect((await api.takeHint('demo', 't1')).kind).toBe('noop')
    expect((await api.getProgress()).courses.demo.tasks.t1.status).toBe('skipped')
  })

  it('подсказок не больше, чем есть у задачи', async () => {
    const { api } = setup()
    await api.takeHint('demo', 't1')
    const second = await api.takeHint('demo', 't1')
    expect(second.revealed.hints).toEqual(['Первая', 'Вторая'])
    const third = await api.takeHint('demo', 't1')
    expect(third.kind).toBe('noop')
    expect(third.state.hintsUsed).toBe(2)
    // 20 − 2·5 = 10
    expect((await api.submitAnswer('demo', 't1', ['8'])).state.xp).toBe(10)
  })
})

describe('задача с несколькими полями ответа', () => {
  it('верные поля фиксируются, одна отправка — одна ошибка', async () => {
    const { submit } = setup()
    const r = await submit('t2', ['2', '10'])
    expect(r).toMatchObject({ kind: 'wrong', note: 'Неверных ответов: 1', xpLost: 2 })
    expect(r.state).toMatchObject({ errors: 1, okParts: [true, false] })
    // Верное значение уже решённого поля можно показать, второго — нет
    expect(r.revealed.answer.parts).toEqual(['2', null])

    const both = await submit('t2', ['100', '200'])
    expect(both.note).toBe('Неверных ответов: 1')

    // Решённое поле повторно вводить не нужно
    const ok = await submit('t2', ['', '34,65'])
    expect(ok.state).toMatchObject({ status: 'correct', okParts: [true, true], answers: ['2', '34,6'], xp: 10 - 2 - 2 })
  })

  it('два неверных поля — всё равно одна ошибка', async () => {
    const { submit } = setup()
    const r = await submit('t2', ['1', '1'])
    expect(r.note).toBe('Неверных ответов: 2')
    expect(r.state.errors).toBe(1)
  })

  it('пустое поле и не число — не ошибка', async () => {
    const { submit } = setup()
    expect((await submit('t2', ['2', ''])).message).toBe('Заполните все поля ответа')
    expect((await submit('t2', ['2', 'много'])).kind).toBe('invalid')
  })

  it('«Я не знаю» после частично верного ответа оставляет решённое поле', async () => {
    const { api, submit } = setup()
    await submit('t2', ['2', '1'])
    const r = await api.skipTask('demo', 't2')
    expect(r.state).toMatchObject({ status: 'skipped', answers: ['2', ''], okParts: [true, false], xp: 0 })
    expect(r.revealed.answer.parts).toEqual(['2', '34,6'])
  })
})

describe('точная цена, свои настройки курса', () => {
  it('поле xp важнее уровня, штрафы считаются от него', async () => {
    const { api, submit } = setup()
    const content = sampleContent()
    content.courses[0].lessons[0].tasks[0].xp = 40
    const custom = createLocalApi({ source: sourceOf(content), kv: memoryKv(), now: () => 0 })
    await custom.submitAnswer('demo', 't1', ['1'])
    expect((await custom.submitAnswer('demo', 't1', ['8'])).state.xp).toBe(32)
    expect((await submit('t1', ['8'])).state.xp).toBe(20)
    void api
  })

  it('штрафы и пауза берутся из настроек курса', async () => {
    const { submit, clock } = setup({ errorPenalty: 0.5, cooldownFromError: 1, cooldownSeconds: 5 })
    const r = await submit('t1', ['1'])
    expect(r.xpLost).toBe(10)
    expect(r.state.lockUntil).toBe(clock.now + 5000)
  })
})

describe('вопросы по ходу видео', () => {
  it('верный вариант и пояснение приходят только после ответа', async () => {
    const { api } = setup()
    const r = await api.answerQuiz('demo', 'l1', 0, 2)
    expect(r).toEqual({ saved: { choice: 2, ok: false }, correct: 1, explain: 'Потому что Б' })
    expect((await api.getProgress()).courses.demo.quiz).toEqual({ l1: { 0: { choice: 2, ok: false } } })
  })

  it('повтор в конце видео: ответ и пропуск помечаются retried', async () => {
    const { api } = setup()
    await api.answerQuiz('demo', 'l1', 0, 2)
    const again = await api.answerQuiz('demo', 'l1', 0, 1, { retry: true })
    expect(again.saved).toEqual({ choice: 1, ok: true, retried: true })

    const other = setup().api
    await other.answerQuiz('demo', 'l1', 0, 0)
    expect((await other.skipQuizRetry('demo', 'l1', 0)).saved).toEqual({ choice: 0, ok: false, retried: true })
  })
})

describe('сохранение прогресса', () => {
  it('прогресс пишется в хранилище и читается новым api после «перезагрузки»', async () => {
    const { api, kv } = setup()
    await api.submitAnswer('demo', 't1', ['8'])
    expect(JSON.parse(kv.data[KEY_V2]).courses.demo.tasks.t1.xp).toBe(20)

    const reloaded = createLocalApi({ source: sourceOf(sampleContent()), kv })
    expect((await reloaded.getProgress()).courses.demo.tasks.t1.status).toBe('correct')
    expect((await reloaded.getRevealed('demo', ['t1'])).t1.solution).toBe('Разбор $x = 8$')
  })

  it('сброс прогресса курса', async () => {
    const { api } = setup()
    await api.submitAnswer('demo', 't1', ['8'])
    await api.answerQuiz('demo', 'l1', 0, 1)
    expect((await api.resetProgress('demo')).courses).toEqual({})
    expect((await api.getRevealed('demo', ['t1'])).t1.solution).toBeNull()
  })

  it('неизвестная задача или курс — понятная ошибка', async () => {
    const { api } = setup()
    await expect(api.submitAnswer('demo', 'net', ['1'])).rejects.toThrow(/Задача «net» не найдена/)
    await expect(api.takeHint('net', 't1')).rejects.toThrow(/Курс «net» не найден/)
  })
})
