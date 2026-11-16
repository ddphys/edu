import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { createLocalApi } from '../src/api/local.js'
import { memoryKv } from '../src/api/progress.js'
import { SERIES_LENGTH, answer, current, shuffle, startSeries, stats } from '../src/trainers/engine.js'
import { ANGLES, checkDir, checkType, correctAnswer, describe as describeSit, dirOptions, explainSteps, instanceOf, needsDirection, reviewHeading, variantsOf } from '../src/trainers/friction/instance.js'
import { SITUATIONS, situationById, situationsOf } from '../src/trainers/friction/scenes/index.js'
import { newSeries, nextSeries, poolOf } from '../src/trainers/friction/series.js'
import { arrowsOf, frictionOf, makeFrame } from '../src/trainers/draw/geometry.js'
import Scene from '../src/trainers/draw/Scene.jsx'
import { sampleContent, sourceOf } from './helpers.js'

// ---------- ключ ответов: берём прямо из docs/trainer-friction-tasks.md ----------
// Строки таблиц уровней 1 и 2: | № | Ситуация | На рисунке | Тип | Напр. | Почему | Ловушка |
const TYPE = { покоя: 'rest', скольжения: 'slide', нет: 'none', '?': 'unknown' }
const DIR = { влево: 'left', вправо: 'right', вверх: 'up', вниз: 'down' }

function readKey() {
  const md = readFileSync(new URL('../docs/trainer-friction-tasks.md', import.meta.url), 'utf8')
  const key = {}
  for (const line of md.split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    const id = cells[1]
    if (!/^[12]\.\d+$/.test(id ?? '')) continue
    const dir = cells[5]
    key[id] = { type: TYPE[cells[4]], dir: dir === '—' ? null : DIR[dir], why: cells[6], text: cells[2] }
  }
  return key
}
const KEY = readKey()

// «mg sin α» в ключе — формула в коде
const plain = (s) => s.replaceAll('$mg\\sin\\alpha$', 'mg sin α')

describe('ключ ответов уровней 1–2', () => {
  it('в ключе есть все ситуации, и в коде нет лишних', () => {
    const expected = [...Array(10).keys()].map((i) => `1.${i + 1}`).concat([...Array(12).keys()].map((i) => `2.${i + 1}`))
    expect(Object.keys(KEY).sort()).toEqual([...expected].sort())
    expect(SITUATIONS.map((s) => s.id).sort()).toEqual([...expected].sort())
    expect(situationsOf(1)).toHaveLength(10)
    expect(situationsOf(2)).toHaveLength(12)
  })

  for (const sit of SITUATIONS) {
    describe(`ситуация ${sit.id}`, () => {
      const key = KEY[sit.id]

      it('прямой вид: тип, направление и «Почему» — как в ключе', () => {
        const inst = describeSit(sit)
        expect(inst.type).toBe(key.type)
        expect(inst.dir).toBe(key.dir)
        expect(plain(inst.why)).toBe(key.why)
        expect(correctAnswer(inst)).toEqual(key.dir ? { type: key.type, dir: key.dir } : { type: key.type })
      })

      for (const variant of Array.from({ length: variantsOf(sit) }, (_, i) => i)) {
        it(`зеркало (вариант ${variant}): «влево/вправо» отражаются, «вверх/вниз» — нет`, () => {
          const straight = describeSit(sit, { variant })
          const mirrored = describeSit(sit, { mirror: true, variant })
          expect(mirrored.type).toBe(straight.type)
          const flip = { left: 'right', right: 'left' }
          const expected = sit.surface === 'table' ? (flip[key.dir] ?? key.dir) : key.dir
          expect(mirrored.dir).toBe(expected)
          // движок проверки принимает именно верный ответ и отвергает остальные
          for (const inst of [straight, mirrored]) {
            expect(checkType(inst, inst.type)).toBe(true)
            for (const wrong of ['rest', 'slide', 'none', 'unknown'].filter((t) => t !== inst.type)) expect(checkType(inst, wrong)).toBe(false)
            if (inst.dir) {
              const options = dirOptions(inst).map((o) => o.code)
              expect(options).toContain(inst.dir)
              expect(options.filter((d) => checkDir(inst, d))).toEqual([inst.dir])
            } else expect(needsDirection(inst.type)).toBe(false)
          }
          // тексты: в зеркале «вправо» и «влево» поменялись местами, остальное — то же
          if (sit.surface === 'table') {
            const swap = (s) => s.replaceAll('вправо', '\u0000').replaceAll('влево', 'вправо').replaceAll('\u0000', 'влево')
            expect(mirrored.text).toBe(swap(straight.text))
            expect(mirrored.why).toBe(swap(straight.why))
          } else {
            expect(mirrored.text).toBe(straight.text)
            expect(mirrored.why).toBe(straight.why)
          }
        })
      }
    })
  }

  it('на «вправо/влево» ответ в зеркале ровно противоположный, на «вверх/вниз» — прежний', () => {
    for (const sit of SITUATIONS.filter((s) => s.dir)) {
      const a = describeSit(sit).dir
      const b = describeSit(sit, { mirror: true }).dir
      if (['left', 'right'].includes(a)) expect(b).not.toBe(a)
      else expect(b).toBe(a)
    }
  })

  it('кнопки шага 2: у стола влево/вправо, у склона и стены вверх/вниз; порядок кнопок не зависит от зеркала', () => {
    const table = describeSit(situationById('1.2'))
    const slope = describeSit(situationById('2.1'))
    const slopeMirror = describeSit(situationById('2.1'), { mirror: true })
    const wall = describeSit(situationById('2.10'))
    expect(dirOptions(table).map((o) => o.code)).toEqual(['left', 'right'])
    expect(dirOptions(slope).map((o) => o.code)).toEqual(['up', 'down'])
    expect(dirOptions(slopeMirror).map((o) => o.code)).toEqual(['up', 'down'])
    expect(dirOptions(slope)[0].icon).not.toBe(dirOptions(slopeMirror)[0].icon)
    expect(dirOptions(wall).map((o) => o.label)).toEqual(['Вверх', 'Вниз'])
  })

  it('вопрос называет тело и опору', () => {
    expect(describeSit(situationById('1.2')).ask).toBe('Сила трения на брусок со стороны стола')
    expect(describeSit(situationById('2.1')).ask).toBe('Сила трения на брусок со стороны наклонной плоскости')
    expect(describeSit(situationById('2.10')).ask).toBe('Сила трения на брусок со стороны стены')
  })

  it('разбор: четыре шага, последний называет ответ', () => {
    for (const sit of SITUATIONS) {
      const inst = describeSit(sit)
      const steps = explainSteps(inst)
      expect(steps).toHaveLength(4)
      if (inst.dir) expect(steps[3]).toContain(dirOptions(inst).find((o) => o.code === inst.dir).words)
    }
  })

  it('число вариантов угла: у склона несколько, у стола и стены один', () => {
    expect(variantsOf(situationById('2.1'))).toBe(ANGLES.length)
    expect(variantsOf(situationById('1.2'))).toBe(1)
    expect(variantsOf(situationById('2.10'))).toBe(1)
  })
})

// ---------- серия ----------
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Проходит серию до конца; wrongAt — номера заданий, на которых ученик ошибается
function play(level, seed, wrongAt = []) {
  const rng = seeded(seed)
  let series = newSeries(level, rng)
  const shown = []
  while (!stats(series).finished) {
    const slot = current(series)
    shown.push(slot)
    series = nextSeries(level, series, !wrongAt.includes(series.pos), rng)
  }
  return { series, shown }
}

describe('серия', () => {
  for (const level of [1, 2]) {
    it(`уровень ${level}: ровно ${SERIES_LENGTH} заданий из ситуаций этого уровня`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        const { shown, series } = play(level, seed)
        const ids = new Set(situationsOf(level).map((s) => s.id))
        expect(shown).toHaveLength(SERIES_LENGTH)
        expect(series.results).toHaveLength(SERIES_LENGTH)
        expect(shown.every((s) => ids.has(s.id))).toBe(true)
        expect(shown.every((s) => !s.repeat)).toBe(true)
        // без повторов ситуации в серии не повторяются
        expect(new Set(shown.map((s) => s.id)).size).toBe(SERIES_LENGTH)
        expect(stats(series)).toEqual({ total: SERIES_LENGTH, answered: SERIES_LENGTH, correct: SERIES_LENGTH, finished: true })
      }
    })
  }

  it('порядок случайный: у разных зёрен серии разные', () => {
    const orders = new Set()
    for (let seed = 1; seed <= 10; seed++) orders.add(play(2, seed).shown.map((s) => s.id).join())
    expect(orders.size).toBeGreaterThan(5)
  })

  it('зеркало случайное: в сериях бывают и прямые, и зеркальные задания', () => {
    const all = []
    for (let seed = 1; seed <= 10; seed++) all.push(...play(1, seed).shown)
    expect(all.some((s) => s.mirror)).toBe(true)
    expect(all.some((s) => !s.mirror)).toBe(true)
  })

  it('угол склона случайный, у стола и стены вариант один', () => {
    const slopes = []
    for (let seed = 1; seed <= 20; seed++) slopes.push(...play(2, seed).shown)
    expect(new Set(slopes.filter((s) => situationById(s.id).surface === 'incline').map((s) => s.variant)).size).toBeGreaterThan(1)
    expect(slopes.filter((s) => situationById(s.id).surface !== 'incline').every((s) => s.variant === 0)).toBe(true)
  })

  it('ошибка возвращает ситуацию в серию: через несколько заданий, в зеркальном виде', () => {
    for (const level of [1, 2]) {
      for (let seed = 1; seed <= 30; seed++) {
        const { shown, series } = play(level, seed, [0])
        const first = shown[0]
        const repeats = shown.filter((s) => s.repeat)
        expect(shown).toHaveLength(SERIES_LENGTH)
        expect(repeats).toHaveLength(1)
        const at = shown.findIndex((s) => s.repeat)
        expect(shown[at].id).toBe(first.id)
        expect(shown[at].mirror).toBe(!first.mirror)
        expect(at).toBeGreaterThanOrEqual(2)
        expect(at).toBeLessThanOrEqual(4)
        // повтор занял место другого задания: ситуаций в серии без него — девять
        expect(new Set(shown.map((s) => s.id)).size).toBe(SERIES_LENGTH - 1)
        expect(stats(series)).toMatchObject({ total: SERIES_LENGTH, answered: SERIES_LENGTH, correct: SERIES_LENGTH - 1 })
      }
    }
  })

  it('у повтора склона другой угол', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = seeded(seed)
      let series = startSeries([{ id: '2.1', mirrorable: true, variants: 3 }, { id: '2.2', mirrorable: true, variants: 3 }], { rng, length: 10 })
      const first = current(series)
      series = answer(series, false, [{ id: first.id, mirrorable: true, variants: 3 }, { id: '2.2', mirrorable: true, variants: 3 }], rng)
      const repeat = series.slots.find((s) => s.repeat)
      expect(repeat.variant).not.toBe(first.variant)
    }
  })

  it('ошибка в повторе нового повтора не создаёт', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = seeded(seed)
      let series = newSeries(1, rng)
      series = nextSeries(1, series, false, rng)
      while (series.pos < SERIES_LENGTH) {
        const slot = current(series)
        series = nextSeries(1, series, !slot.repeat ? true : false, rng)
      }
      expect(series.slots.filter((s) => s.repeat)).toHaveLength(1)
    }
  })

  it('ошибка в последнем задании повтора не получает, серия остаётся из 10', () => {
    const { shown, series } = play(1, 5, [SERIES_LENGTH - 1])
    expect(shown).toHaveLength(SERIES_LENGTH)
    expect(shown.some((s) => s.repeat)).toBe(false)
    expect(stats(series)).toMatchObject({ total: SERIES_LENGTH, correct: SERIES_LENGTH - 1, finished: true })
  })

  it('ошибка на предпоследнем задании: повтор встаёт на последнее место', () => {
    const { shown } = play(1, 7, [SERIES_LENGTH - 2])
    expect(shown).toHaveLength(SERIES_LENGTH)
    expect(shown[SERIES_LENGTH - 1].repeat).toBe(true)
    expect(shown[SERIES_LENGTH - 1].id).toBe(shown[SERIES_LENGTH - 2].id)
  })

  it('все ответы неверные: повторов не больше, чем есть мест, серия всё равно из 10', () => {
    const { shown, series } = play(2, 3, [...Array(SERIES_LENGTH).keys()])
    expect(shown).toHaveLength(SERIES_LENGTH)
    expect(stats(series).correct).toBe(0)
  })

  it('перемешивание не теряет элементов', () => {
    expect(shuffle([1, 2, 3, 4, 5], seeded(1)).sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('пул уровня — все его ситуации', () => {
    expect(poolOf(1).map((s) => s.id)).toEqual(situationsOf(1).map((s) => s.id))
    expect(poolOf(2)).toHaveLength(12)
  })

  it('слот превращается в задание', () => {
    const slot = { id: '1.2', mirror: true, variant: 0, repeat: false }
    expect(instanceOf(slot)).toMatchObject({ id: '1.2', mirror: true, dir: 'right' })
  })
})

// ---------- рисунок ----------
describe('рисовалка схем', () => {
  it('зеркало отражает стол, склон и стену слева направо', () => {
    for (const surface of ['table', 'incline', 'wall']) {
      const straight = makeFrame({ surface })
      const mirrored = makeFrame({ surface, mirror: true })
      const [sx, sy] = straight.P(0, 0)
      const [mx, my] = mirrored.P(0, 0)
      expect(mx).toBeCloseTo(400 - sx, 5)
      expect(my).toBeCloseTo(sy, 5)
      // «вдоль опоры» по экрану: x отражается, y — нет
      expect(mirrored.along[0]).toBeCloseTo(-straight.along[0], 5)
      expect(mirrored.along[1]).toBeCloseTo(straight.along[1], 5)
    }
  })

  it('«вверх по склону» всегда вверх на экране, зеркало лишь разворачивает склон', () => {
    for (const mirror of [false, true]) {
      const { P } = makeFrame({ surface: 'incline', angle: 30, mirror })
      const [x0, y0] = P(0, 0)
      const [x1, y1] = P(100, 0)
      expect(y1).toBeLessThan(y0)
      expect(Math.sign(x1 - x0)).toBe(mirror ? -1 : 1)
    }
  })

  it('«вверх» у стены — вверх на экране, тело стоит со стороны, противоположной стене', () => {
    for (const mirror of [false, true]) {
      const { P } = makeFrame({ surface: 'wall', mirror })
      const [x0, y0] = P(0, 0)
      expect(P(40, 0)[1]).toBeLessThan(y0)
      const bodyX = P(0, -20)[0]
      expect(Math.sign(bodyX - x0)).toBe(mirror ? 1 : -1)
    }
  })

  it('стол: вправо в прямом виде — вправо на экране, в зеркале — влево', () => {
    expect(makeFrame({ surface: 'table' }).P(10, 0)[0]).toBeGreaterThan(200)
    expect(makeFrame({ surface: 'table', mirror: true }).P(10, 0)[0]).toBeLessThan(200)
  })

  it('стрелки скорости и силы не заходят на тело', () => {
    for (const sit of SITUATIONS) {
      const { h } = { h: sit.surface === 'wall' ? 54 : 42 }
      for (const a of arrowsOf(sit.figure, sit.surface))
        if (a.kind === 'v') for (const s of a.segs) expect(Math.max(s.y1, s.y2)).toBeLessThan(-h)
    }
  })

  it('стрелка трения идёт в сторону ответа', () => {
    expect(frictionOf('right', 'table').segs[0].x2).toBeGreaterThan(0)
    expect(frictionOf('left', 'table').segs[0].x2).toBeLessThan(0)
    expect(frictionOf('up', 'incline').segs[0].x2).toBeGreaterThan(0)
    expect(frictionOf('down', 'wall').segs[0].x2).toBeLessThan(0)
  })

  it('каждая ситуация рисуется в обоих видах, с разбором и без; стрелка трения — только в разборе', () => {
    for (const sit of SITUATIONS) {
      for (const mirror of [false, true]) {
        const inst = describeSit(sit, { mirror })
        const props = { figure: inst.figure, surface: inst.surface, angle: inst.angle, mirror, label: inst.text }
        const plainSvg = renderToStaticMarkup(createElement(Scene, props))
        expect(plainSvg).toContain('<svg')
        expect(plainSvg).not.toContain('tr-fric')
        expect(plainSvg).not.toContain('NaN')
        if (inst.dir) {
          const withFric = renderToStaticMarkup(createElement(Scene, { ...props, friction: { dir: inst.dir } }))
          expect(withFric).toContain('tr-fric')
          expect(withFric).not.toContain('NaN')
        }
      }
    }
  })
})

// ---------- журнал попыток ----------
describe('журнал попыток тренажёра', () => {
  it('ответы тренажёра пишутся в общий журнал и не смешиваются с курсами', async () => {
    const kv = memoryKv()
    const api = createLocalApi({ source: sourceOf(sampleContent()), kv, now: () => 5 })
    await api.submitAnswer('demo', 't1', ['-8'])
    await api.logAttempt({ course: 'trainer-friction', task: '1.2', kind: 'wrong', input: ['rest', 'right'], ms: 4000 })
    await api.logAttempt({ course: 'trainer-friction', task: '1.2', kind: 'correct', input: ['rest', 'left'] })
    const { events } = await api.getAttempts()
    expect(events).toHaveLength(3)
    expect(events[1]).toEqual({ at: 5, course: 'trainer-friction', task: '1.2', kind: 'wrong', input: ['rest', 'right'], ms: 4000 })
    expect(events[2].kind).toBe('correct')
  })
})

describe('заголовок разбора', () => {
  it('называет то, что ученик должен был ответить', () => {
    const slide = describeSit(situationById('1.4'))
    expect(reviewHeading(slide, { ok: false, stage: 'dir' })).toBe('Не совсем: трение — влево')
    expect(reviewHeading(slide, { ok: false, stage: 'type' })).toBe('Не совсем: это трение скольжения, влево')
    expect(reviewHeading(slide, { ok: true })).toBe('Верно: это трение скольжения, влево')
    const none = describeSit(situationById('1.9'))
    expect(reviewHeading(none, { ok: false })).toBe('Не совсем: трения здесь нет')
    expect(reviewHeading(describeSit(situationById('2.9')), { ok: false })).toBe('Не совсем: без расчёта не определить')
  })
})
