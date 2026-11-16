import { describe, expect, it } from 'vitest'
import { KEY_ATTEMPTS, MAX_EVENTS, addEvent, emptyJournal, readJournal, summarize } from '../src/api/attempts.js'
import { createLocalApi } from '../src/api/local.js'
import { memoryKv } from '../src/api/progress.js'
import { sampleContent, sourceOf } from './helpers.js'

function setup() {
  const kv = memoryKv()
  const clock = { now: 1_000_000 }
  const api = createLocalApi({ source: sourceOf(sampleContent()), kv, now: () => clock.now })
  return { api, kv, clock }
}

describe('журнал попыток', () => {
  it('записывает сами неверные ответы, время и подсказки', async () => {
    const { api, kv, clock } = setup()
    await api.submitAnswer('demo', 't1', ['-8'], { ms: 41_000 })
    clock.now += 60_000
    await api.takeHint('demo', 't1', { ms: 5_000 })
    await api.submitAnswer('demo', 't1', ['8'], { ms: 12_300.6 })

    const { events } = await api.getAttempts()
    expect(events).toEqual([
      { at: 1_000_000, course: 'demo', task: 't1', kind: 'wrong', input: ['-8'], ms: 41_000, hints: 0, errors: 1 },
      { at: 1_060_000, course: 'demo', task: 't1', kind: 'hint', ms: 5_000, hints: 1, errors: 1 },
      { at: 1_060_000, course: 'demo', task: 't1', kind: 'correct', input: ['8'], ms: 12_301, hints: 1, errors: 1 },
    ])
    // Журнал лежит в хранилище и переживает перезагрузку страницы
    expect(readJournal(kv).events).toHaveLength(3)
  })

  it('неразобранный ввод тоже записывается, но ошибкой не считается', async () => {
    const { api } = setup()
    const r = await api.submitAnswer('demo', 't1', ['8 м/с'])
    expect(r.kind).toBe('invalid')
    const { events } = await api.getAttempts()
    expect(events).toEqual([{ at: 1_000_000, course: 'demo', task: 't1', kind: 'invalid', input: ['8 м/с'], hints: 0, errors: 0 }])
  })

  it('«Я не знаю» записывается; повторные действия над завершённой задачей — нет', async () => {
    const { api } = setup()
    await api.skipTask('demo', 't1', { ms: 900 })
    await api.submitAnswer('demo', 't1', ['8'])
    await api.takeHint('demo', 't1')
    const { events } = await api.getAttempts()
    expect(events.map((e) => e.kind)).toEqual(['skip'])
  })

  it('на проверку ответа и на прогресс журнал не влияет', async () => {
    const { api } = setup()
    const r = await api.submitAnswer('demo', 't1', ['7'], { ms: 1 })
    expect(r.state).not.toHaveProperty('ms')
    expect(JSON.stringify(await api.getProgress())).not.toMatch(/"input"|"events"/)
  })

  it('сброс прогресса журнал не стирает, а оставляет в нём отметку', async () => {
    const { api } = setup()
    await api.submitAnswer('demo', 't1', ['7'])
    await api.resetProgress('demo')
    const { events } = await api.getAttempts()
    expect(events.map((e) => e.kind)).toEqual(['wrong', 'reset'])
    expect(events[1]).toEqual({ at: 1_000_000, course: 'demo', kind: 'reset' })
  })

  it('повреждённый журнал не мешает работе: начинается новый', async () => {
    const { api, kv } = setup()
    kv.set(KEY_ATTEMPTS, '{не json')
    await api.submitAnswer('demo', 't1', ['7'])
    expect((await api.getAttempts()).events).toHaveLength(1)
  })
})

describe('addEvent', () => {
  it('обрезает длинный ввод и неправдоподобное время, старые события вытесняет', () => {
    const journal = emptyJournal()
    addEvent(journal, { at: 1, course: 'c', task: 't', kind: 'wrong', input: ['x'.repeat(500)], ms: 9e9 })
    expect(journal.events[0].input[0]).toHaveLength(120)
    expect(journal.events[0].ms).toBe(60 * 60 * 1000)
    addEvent(journal, { at: 2, course: 'c', task: 't', kind: 'wrong', input: [1, 2], ms: -5 })
    expect(journal.events[1]).toEqual({ at: 2, course: 'c', task: 't', kind: 'wrong', input: [1, 2] })

    for (let i = 0; i < MAX_EVENTS + 10; i++) addEvent(journal, { at: 10 + i, course: 'c', task: 't', kind: 'hint' })
    expect(journal.events).toHaveLength(MAX_EVENTS)
    expect(journal.events.at(-1).at).toBe(10 + MAX_EVENTS + 9)
  })
})

describe('summarize: сводка для «Работы над ошибками»', () => {
  it('собирает по задачам неверные ответы, подсказки и время; задачи без ошибок не попадают', async () => {
    const { api, clock } = setup()
    await api.submitAnswer('demo', 't1', ['-8'], { ms: 40_000 })
    await api.submitAnswer('demo', 't1', ['80'], { ms: 20_000 })
    await api.takeHint('demo', 't1', { ms: 1_000 })
    clock.now += 5_000
    await api.submitAnswer('demo', 't1', ['8'], { ms: 9_000 })
    await api.submitAnswer('demo', 't2', ['2', '34,6'], { ms: 30_000 })

    expect(summarize(await api.getAttempts(), 'demo')).toEqual({
      t1: { wrong: [['-8'], ['80']], invalid: [], hints: 1, skipped: false, solved: true, ms: 70_000, lastAt: 1_005_000 },
    })
    expect(summarize(await api.getAttempts(), 'other')).toEqual({})
  })

  it('считает с последнего сброса прогресса', async () => {
    const { api } = setup()
    await api.submitAnswer('demo', 't1', ['7'])
    await api.resetProgress('demo')
    expect(summarize(await api.getAttempts(), 'demo')).toEqual({})
    await api.skipTask('demo', 't1')
    expect(summarize(await api.getAttempts(), 'demo').t1).toMatchObject({ wrong: [], skipped: true, solved: false })
  })
})
