import { describe, expect, it } from 'vitest'
import { createLocalApi } from '../src/api/local.js'
import { KEY_V1, KEY_V2, browserKv, memoryKv, migrateV1, readProgress, totalXp } from '../src/api/progress.js'
import { checkContentDir } from '../scripts/content-fs.js'
import { sourceOf } from './helpers.js'

// Сохранение в том виде, в каком его писал старый сайт (ключ edu-progress-v1):
// решённые задачи нового и совсем старого вида, начатая задача, ответы на вопрос к видео.
const OLD = {
  l1t1: { status: 'correct', errors: 1, lockUntil: 0, hintsUsed: 1, answers: ['8'], okParts: [true], xp: 5 },
  // совсем старое сохранение: attempts вместо errors, ответ одной строкой
  l1t2: { status: 'correct', attempts: 3, hintsUsed: 0, answer: '-6', xp: 3 },
  l1t3: { status: 'pending', errors: 2, lockUntil: 0, hintsUsed: 1, answers: [], okParts: [], xp: 0 },
  // совсем старое сохранение начатой задачи: две неверные попытки
  l2t2: { status: 'pending', attempts: 2, hintsUsed: 0 },
  l2t1: { status: 'skipped', errors: 0, lockUntil: 0, hintsUsed: 0, answers: [''], okParts: [], xp: 0 },
  'quiz:l1': { 0: { choice: 2, ok: false, retried: true } },
}

describe('перенос старого прогресса (edu-progress-v1 → v2)', () => {
  it('задачи и ответы на вопросы к видео попадают в указанный курс без изменений', () => {
    const v2 = migrateV1(OLD, 'physics-olymp-10-11')
    expect(v2.version).toBe(2)
    const course = v2.courses['physics-olymp-10-11']
    expect(course.tasks).toEqual({ l1t1: OLD.l1t1, l1t2: OLD.l1t2, l1t3: OLD.l1t3, l2t1: OLD.l2t1, l2t2: OLD.l2t2 })
    expect(course.quiz).toEqual({ l1: OLD['quiz:l1'] })
    expect(totalXp(v2)).toBe(8)
  })

  it('пустое или испорченное старое сохранение — пустой прогресс', () => {
    for (const bad of [null, undefined, [], 'строка', 5]) expect(migrateV1(bad, 'c').courses).toEqual({})
    expect(migrateV1({ l1t1: null, x: 'мусор' }, 'c').courses).toEqual({})
  })

  it('перенос происходит один раз, старый ключ остаётся запасной копией', () => {
    const kv = memoryKv({ [KEY_V1]: JSON.stringify(OLD) })
    const first = readProgress(kv, 'physics-olymp-10-11')
    expect(first.courses['physics-olymp-10-11'].tasks.l1t1.xp).toBe(5)
    expect(kv.data[KEY_V1]).toBe(JSON.stringify(OLD))
    expect(JSON.parse(kv.data[KEY_V2])).toEqual(first)

    // Старый ключ потом изменился (открыли старую вкладку) — новый прогресс важнее
    kv.set(KEY_V1, JSON.stringify({ l1t1: { status: 'pending', xp: 0 } }))
    expect(readProgress(kv, 'physics-olymp-10-11')).toEqual(first)
  })

  it('испорченный новый ключ не теряет старое сохранение', () => {
    const kv = memoryKv({ [KEY_V1]: JSON.stringify(OLD), [KEY_V2]: '{не json' })
    expect(totalXp(readProgress(kv, 'c'))).toBe(8)
  })

  it('нет никаких сохранений — пустой прогресс, в хранилище ничего не пишется', () => {
    const kv = memoryKv()
    expect(readProgress(kv, 'c')).toEqual({ version: 2, courses: {} })
    expect(kv.data).toEqual({})
  })

  it('недоступный localStorage не роняет страницу', () => {
    const original = globalThis.localStorage
    globalThis.localStorage = {
      getItem() {
        throw new Error('нет доступа')
      },
      setItem() {
        throw new Error('нет места')
      },
    }
    try {
      expect(readProgress(browserKv, 'c')).toEqual({ version: 2, courses: {} })
      expect(() => browserKv.set('a', '1')).not.toThrow()
    } finally {
      globalThis.localStorage = original
    }
  })
})

describe('старый прогресс на опубликованном курсе', () => {
  // Настоящий контент из public/content и браузер, в котором лежит только старое сохранение
  const { content } = checkContentDir()
  const open = () => {
    const kv = memoryKv({ [KEY_V1]: JSON.stringify(OLD) })
    return { kv, api: createLocalApi({ source: sourceOf(content), kv }) }
  }
  const COURSE = 'physics-olymp-10-11'

  it('XP и статусы задач на месте', async () => {
    const { api } = open()
    const progress = await api.getProgress()
    expect(totalXp(progress)).toBe(8)
    const tasks = progress.courses[COURSE].tasks
    expect(tasks.l1t1.status).toBe('correct')
    expect(tasks.l1t2.status).toBe('correct')
    expect(tasks.l2t1.status).toBe('skipped')
    expect(progress.courses[COURSE].quiz.l1[0]).toEqual({ choice: 2, ok: false, retried: true })
  })

  it('у решённых задач открыт разбор и ответ, у начатой — взятая подсказка', async () => {
    const { api } = open()
    const revealed = await api.getRevealed(COURSE, ['l1t1', 'l1t2', 'l1t3', 'l2t1', 'l3t1'])
    expect(revealed.l1t1.solution).toMatch(/Запишем формулу/)
    expect(revealed.l1t1.answer.parts).toEqual(['8'])
    expect(revealed.l1t2.answer.parts).toEqual(['-6'])
    expect(revealed.l1t3.hints).toHaveLength(1)
    expect(revealed.l1t3.solution).toBeNull()
    expect(revealed.l2t1.solution).toBeTruthy()
    expect(revealed.l3t1).toEqual({ hints: [], solution: null, answer: { parts: [null] } })
  })

  it('начатую задачу можно дорешать: старые ошибки и подсказка учитываются', async () => {
    const { api } = open()
    // l1t3: уровень 1 (5 XP), 2 ошибки по 1 XP и подсказка 1 XP → 2 XP
    const r = await api.submitAnswer(COURSE, 'l1t3', ['25'])
    expect(r.state).toMatchObject({ status: 'correct', errors: 2, hintsUsed: 1, xp: 2 })
    expect(totalXp(await api.getProgress())).toBe(10)
  })

  it('совсем старое сохранение (attempts вместо errors): ошибки не теряются', async () => {
    const { api } = open()
    // l2t2: уровень 1 (5 XP), две старые ошибки по 1 XP → 3 XP
    const r = await api.submitAnswer(COURSE, 'l2t2', ['50'])
    expect(r.state).toMatchObject({ status: 'correct', errors: 2, xp: 3 })
    // третья ошибка по старому счёту включает паузу
    const other = open().api
    const wrong = await other.submitAnswer(COURSE, 'l2t2', ['1'])
    expect(wrong.state.errors).toBe(3)
    expect(wrong.state.lockUntil).toBeGreaterThan(0)
  })

  it('решённая задача повторно не засчитывается', async () => {
    const { api } = open()
    expect((await api.submitAnswer(COURSE, 'l1t1', ['8'])).kind).toBe('noop')
    expect(totalXp(await api.getProgress())).toBe(8)
  })
})
