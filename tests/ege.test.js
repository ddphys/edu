import { describe, expect, it } from 'vitest'
import { EGE } from '../src/ege/config.js'
import { PART1_MAX, PART2_MAX, TOTAL, calc, examsOf, kindOf, primaryFor, toTest } from '../src/ege/calc.js'
import { asciiName, isOurs, merge, norm, parseText, serialize, toLists } from '../src/ege/data.js'
import { LS_KEY, createLocalEgeStore } from '../src/ege/store.js'

// Пробник ex_2 из примера данных бланка (ege-data-sample.json)
const EX2 = { studentId: 'st_alina', title: 'Пробник 2', date: '2026-11-03', scores: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 7: 1, 8: 1, 9: 1, 10: 2, 14: 2, 15: 0, 18: 2 } }

describe('бланк ЕГЭ: структура экзамена', () => {
  it('45 первичных, части 28 и 17', () => {
    expect(TOTAL).toBe(45)
    expect(PART1_MAX).toBe(28)
    expect(PART2_MAX).toBe(17)
    expect(EGE.scale).toHaveLength(TOTAL + 1)
  })

  it('темы покрывают каждое задание ровно один раз и в сумме дают 45', () => {
    const all = EGE.topics.flatMap((t) => t.tasks).sort((a, b) => a - b)
    expect(all).toEqual(Array.from({ length: 26 }, (_, i) => i + 1))
    const sum = EGE.topics.reduce((s, t) => s + t.tasks.reduce((a, n) => a + EGE.maxes[n - 1], 0), 0)
    expect(sum).toBe(45)
  })

  it('шкала не убывает, порог 36 = 8 первичных', () => {
    for (let i = 1; i < EGE.scale.length; i++) expect(EGE.scale[i]).toBeGreaterThanOrEqual(EGE.scale[i - 1])
    expect(primaryFor(36)).toBe(8)
    expect(toTest(8)).toBe(36)
    expect(primaryFor(100)).toBe(45)
  })
})

describe('бланк ЕГЭ: расчёт', () => {
  it('контрольный пример: 14 первичных, 48 тестовых, баллы по темам', () => {
    const c = calc(EX2)
    expect(c.p).toBe(14)
    expect(c.test).toBe(48)
    const got = Object.fromEntries(Object.entries(c.topics).map(([k, v]) => [k, `${v.got}/${v.max}`]))
    expect(got).toEqual({ mech: '5/14', mol: '5/11', el: '2/13', q: '0/3', meth: '0/2', mix: '2/2' })
    expect(c.checked).toBe(12)
  })

  it('«не решал» даёт 0, считается проверенным и теряет максимум', () => {
    const c = calc({ scores: { 24: -1, 26: 4 } })
    expect(c.p).toBe(4)
    expect(c.checked).toBe(2)
    expect(c.skipped).toBe(1)
    expect(c.lost).toBe(3)
    expect(c.p2).toBe(4)
  })

  it('балл выше максимума обрезается', () => {
    expect(calc({ scores: { 1: 5 } }).p).toBe(1)
  })

  it('состояние задания', () => {
    expect(kindOf(undefined, 2)).toBe('')
    expect(kindOf(-1, 2)).toBe('skip')
    expect(kindOf(2, 2)).toBe('full')
    expect(kindOf(1, 2)).toBe('mid')
    expect(kindOf(0, 2)).toBe('zero')
  })

  it('пробники по дате, при равной дате по времени создания', () => {
    const list = [
      { id: 'b', studentId: 's', date: '2026-11-03', createdAt: 2 },
      { id: 'c', studentId: 'x', date: '2026-01-01', createdAt: 1 },
      { id: 'a', studentId: 's', date: '2026-11-03', createdAt: 1 },
      { id: 'z', studentId: 's', date: '2026-10-20', createdAt: 9 },
    ]
    expect(examsOf(list, 's').map((e) => e.id)).toEqual(['z', 'a', 'b'])
  })
})

describe('бланк ЕГЭ: формат данных и слияние', () => {
  const rec = (t, extra = {}) => ({ _t: t, ...extra })

  it('узнаёт свой файл и не трогает чужой', () => {
    expect(isOurs({ app: 'ege-blank' })).toBe(true)
    expect(isOurs({ students: {} })).toBe(true)
    expect(isOurs({ foo: 1 })).toBe(false)
    expect(isOurs([])).toBe(false)
    expect(() => parseText('{"foo":1}')).toThrow(SyntaxError)
    expect(parseText('   ')).toBeNull()
  })

  it('побеждает более новая версия записи', () => {
    const a = norm({ exams: { e: rec(1, { title: 'старое' }) } })
    const b = norm({ exams: { e: rec(2, { title: 'новое' }) } })
    expect(merge(a, b).exams.e.title).toBe('новое')
    expect(merge(b, a).exams.e.title).toBe('новое')
  })

  it('удалённое не возвращается из старой копии', () => {
    const live = norm({ exams: {}, deleted: { 'exams/e': 5 } })
    const old = norm({ exams: { e: rec(3) } })
    expect(merge(live, old).exams.e).toBeUndefined()
    expect(merge(old, live).exams.e).toBeUndefined()
    // но запись, изменённая после удаления, остаётся
    expect(merge(live, norm({ exams: { e: rec(9) } })).exams.e).toBeDefined()
  })

  it('слияние ничего не теряет', () => {
    const a = norm({ students: { s1: rec(1) }, exams: { e1: rec(1) } })
    const b = norm({ students: { s2: rec(1) }, exams: { e2: rec(1) } })
    const m = merge(a, b)
    expect(Object.keys(m.students).sort()).toEqual(['s1', 's2'])
    expect(Object.keys(m.exams).sort()).toEqual(['e1', 'e2'])
  })

  it('файл читается обратно', () => {
    const s = norm({ students: { s: rec(1, { name: 'Алина К.', goal: 80 }) }, exams: { e: rec(2, EX2) }, deleted: { 'exams/old': 3 } })
    const back = parseText(serialize(s))
    expect(back).toEqual(s)
    const lists = toLists(back)
    expect(lists.students).toEqual([{ id: 's', name: 'Алина К.', goal: 80 }])
    expect(calc(lists.exams[0]).test).toBe(48)
  })

  it('имя файла латиницей', () => {
    expect(asciiName('Результат Алина К. 2026-11-03.png')).toBe('Rezultat-Alina-K.-2026-11-03.png')
  })
})

describe('бланк ЕГЭ: хранилище в браузере', () => {
  const memoryStorage = () => {
    const m = new Map()
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), map: m }
  }

  it('сохраняет сразу, читает обратно, помнит удалённое', async () => {
    const storage = memoryStorage()
    const store = createLocalEgeStore({ storage, win: null })
    await store.ready
    expect(store.getSnapshot().status).toBe('ok')
    store.put('students', { id: 's', name: 'Алина К.', goal: 80 })
    store.put('exams', { id: 'e', studentId: 's', ...EX2 })
    expect(JSON.parse(storage.map.get(LS_KEY)).exams.e.scores[10]).toBe(2)

    const again = createLocalEgeStore({ storage, win: null })
    await again.ready
    expect(again.getSnapshot().exams.map((e) => e.id)).toEqual(['e'])
    again.remove('exams', 'e')
    expect(again.getSnapshot().exams).toEqual([])
    expect(JSON.parse(storage.map.get(LS_KEY)).deleted['exams/e']).toBeGreaterThan(0)
  })

  it('снимок не меняется без изменений и сообщает подписчикам', async () => {
    const store = createLocalEgeStore({ storage: memoryStorage(), win: null })
    await store.ready
    const s1 = store.getSnapshot()
    expect(store.getSnapshot()).toBe(s1)
    let calls = 0
    const off = store.subscribe(() => calls++)
    store.put('students', { id: 's', name: 'Б' })
    expect(calls).toBe(1)
    expect(store.getSnapshot()).not.toBe(s1)
    off()
  })

  it('копия вливается, а чужой файл отклоняется', async () => {
    const store = createLocalEgeStore({ storage: memoryStorage(), win: null })
    await store.ready
    store.put('students', { id: 's1', name: 'А' })
    const copy = serialize(norm({ students: { s1: { name: 'А', _t: 1 }, s2: { name: 'Б', _t: 1 } } }))
    expect(store.file.importText(copy)).toEqual({ students: 1, exams: 0 })
    expect(store.getSnapshot().students.map((s) => s.name).sort()).toEqual(['А', 'Б'])
    expect(() => store.file.importText('{"x":1}')).toThrow('Это не файл данных бланка')
    expect(() => store.file.importText('{"app":"ege-blank"}')).toThrow('В файле нет учеников и пробников')
  })
})
