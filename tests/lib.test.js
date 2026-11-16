import { describe, expect, it } from 'vitest'
import {
  DEFAULT_XP_RULES,
  allTasks,
  calcXp as calcXpIn,
  cooldownAfter as cooldownAfterIn,
  emptyTaskState,
  errorCost as errorCostIn,
  errorsOf,
  normalizeState,
  hintCost as hintCostIn,
  minXp as minXpIn,
  parseNumber,
  parseVideo,
  plural,
  taskMaxXp as taskMaxXpIn,
} from '../src/lib.js'
import { getParts, isCorrect } from '../src/types/number/index.js'

// Настройки XP теперь лежат в курсе. Тесты проверяют правила с настройками по умолчанию —
// теми же, что были в src/data/course.js.
const course = DEFAULT_XP_RULES
const taskMaxXp = (task) => taskMaxXpIn(task, course)
const errorCost = (task) => errorCostIn(task, course)
const hintCost = (task) => hintCostIn(task, course)
const minXp = (task) => minXpIn(task, course)
const calcXp = (task, hints, errors) => calcXpIn(task, course, hints, errors)
const cooldownAfter = (errors) => cooldownAfterIn(errors, course)

describe('parseNumber — разбор числа', () => {
  it('понимает целые и дробные числа', () => {
    expect(parseNumber('8')).toBe(8)
    expect(parseNumber('2.5')).toBe(2.5)
    expect(parseNumber('2,5')).toBe(2.5)
    expect(parseNumber('.5')).toBe(0.5)
    expect(parseNumber('5.')).toBe(5)
    expect(parseNumber('+3')).toBe(3)
    expect(parseNumber('0')).toBe(0)
  })

  it('не учитывает пробелы, в том числе внутри числа и неразрывные', () => {
    expect(parseNumber(' 1 000 ')).toBe(1000)
    expect(parseNumber('1 000')).toBe(1000)
    expect(parseNumber('- 6')).toBe(-6)
  })

  it('дефис, минус и тире — один и тот же знак', () => {
    for (const s of ['-6', '−6', '–6', '—6', '‐6']) expect(parseNumber(s)).toBe(-6)
  })

  it('всё, что не число, даёт null', () => {
    for (const s of ['8 м/с', 'abc', '1e3', '', '   ', '1,2,3', '--5', '5-', '1/2', null, undefined])
      expect(parseNumber(s)).toBeNull()
  })
})

describe('isCorrect и getParts — проверка ответа', () => {
  it('без допуска нужен точный ответ', () => {
    expect(isCorrect({ answer: 8 }, '8')).toBe(true)
    expect(isCorrect({ answer: 8 }, '8,0')).toBe(true)
    expect(isCorrect({ answer: 8 }, '8.1')).toBe(false)
    expect(isCorrect({ answer: -6 }, '−6')).toBe(true)
    expect(isCorrect({ answer: -6 }, '6')).toBe(false)
  })

  it('допуск включает границы', () => {
    const part = { answer: 34.6, tolerance: 0.1 }
    expect(isCorrect(part, '34,6')).toBe(true)
    expect(isCorrect(part, '34.7')).toBe(true)
    expect(isCorrect(part, '34.5')).toBe(true)
    expect(isCorrect(part, '34.71')).toBe(false)
  })

  it('не число — не верно', () => {
    expect(isCorrect({ answer: 8 }, '8 м/с')).toBe(false)
    expect(isCorrect({ answer: 0 }, '')).toBe(false)
  })

  it('задача с одним ответом превращается в одно поле', () => {
    expect(getParts({ answer: 8, tolerance: 0.5 })).toEqual([{ label: 'Ваш ответ', answer: 8, tolerance: 0.5 }])
  })

  it('задача с parts отдаёт свои поля', () => {
    const parts = [{ label: 'a', answer: 1 }, { label: 'b', answer: 2 }]
    expect(getParts({ parts })).toBe(parts)
  })
})

describe('XP — цена задачи и штрафы', () => {
  const byLevel = (level) => ({ level })

  it('цена по уровню: 5 / 10 / 20 / 35 / 50, без уровня — как у уровня 2', () => {
    expect([1, 2, 3, 4, 5].map((l) => taskMaxXp(byLevel(l)))).toEqual([5, 10, 20, 35, 50])
    expect(taskMaxXp({})).toBe(10)
  })

  it('поле xp важнее уровня', () => {
    expect(taskMaxXp({ level: 5, xp: 12 })).toBe(12)
  })

  it('ошибка стоит 20% цены, округление до целого, не меньше 1', () => {
    expect([1, 2, 3, 4, 5].map((l) => errorCost(byLevel(l)))).toEqual([1, 2, 4, 7, 10])
    expect(errorCost({ xp: 1 })).toBe(1)
  })

  it('подсказка стоит 25% цены: у задачи за 5 XP — 1, за 10 XP — 3', () => {
    expect([1, 2, 3, 4, 5].map((l) => hintCost(byLevel(l)))).toEqual([1, 3, 5, 9, 13])
  })

  it('минимум за самостоятельное решение — 25% цены', () => {
    expect([1, 2, 3, 4, 5].map((l) => minXp(byLevel(l)))).toEqual([1, 3, 5, 9, 13])
  })

  it('штрафы вычитаются, а не перемножаются', () => {
    const t = byLevel(3) // 20 XP
    expect(calcXp(t, 0, 0)).toBe(20)
    expect(calcXp(t, 1, 0)).toBe(15)
    expect(calcXp(t, 0, 1)).toBe(16)
    expect(calcXp(t, 1, 2)).toBe(7)
  })

  it('решил сам — не меньше минимума, сколько бы ни было ошибок', () => {
    const t = byLevel(3)
    expect(calcXp(t, 2, 3)).toBe(5)
    expect(calcXp(t, 0, 100)).toBe(5)
    expect(calcXp(byLevel(1), 5, 5)).toBe(1)
  })
})

describe('cooldownAfter — пауза от перебора', () => {
  it('первые две ошибки без паузы, с третьей — 20 секунд после каждой', () => {
    expect([0, 1, 2].map(cooldownAfter)).toEqual([0, 0, 0])
    expect([3, 4, 10].map(cooldownAfter)).toEqual([20000, 20000, 20000])
  })
})

describe('errorsOf — чтение старых сохранений', () => {
  it('новое сохранение: берётся errors', () => {
    expect(errorsOf({ errors: 2, attempts: 7, status: 'correct' })).toBe(2)
    expect(errorsOf({ errors: 0, attempts: 5 })).toBe(0)
  })

  it('старое сохранение: attempts включает верную попытку', () => {
    expect(errorsOf({ attempts: 3, status: 'correct' })).toBe(2)
    expect(errorsOf({ attempts: 1, status: 'correct' })).toBe(0)
    expect(errorsOf({ attempts: 0, status: 'correct' })).toBe(0)
  })

  it('старое сохранение без верного ответа: все попытки — ошибки', () => {
    expect(errorsOf({ attempts: 3, status: 'pending' })).toBe(3)
    expect(errorsOf({ attempts: 2, status: 'wrong' })).toBe(2)
    expect(errorsOf({ attempts: 2, status: 'skipped' })).toBe(2)
  })

  it('normalizeState дополняет состояние и не теряет ошибки старого сохранения', () => {
    expect(normalizeState(undefined)).toEqual(emptyTaskState)
    expect(normalizeState({ status: 'correct', attempts: 3, xp: 3 })).toMatchObject({ errors: 2, hintsUsed: 0, okParts: [], xp: 3 })
    expect(normalizeState({ status: 'pending', attempts: 2 }).errors).toBe(2)
    expect(normalizeState({ errors: 1, attempts: 9 }).errors).toBe(1)
  })

  it('пустое состояние — ноль ошибок', () => {
    expect(errorsOf({})).toBe(0)
    expect(errorsOf(emptyTaskState)).toBe(0)
  })
})

describe('parseVideo — разбор ссылки на видео', () => {
  it('YouTube во всех видах ссылок', () => {
    const id = 'dQw4w9WgXcQ'
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?feature=share&v=${id}&t=10`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
    ]) {
      expect(parseVideo(url)).toEqual({
        type: 'youtube',
        id,
        embed: `https://www.youtube.com/embed/${id}?rel=0&playsinline=1`,
      })
    }
  })

  it('Rutube: ссылка, встраивание и голый id', () => {
    const id = '09391c5817d4189bc014b23f904e324c'
    const expected = { type: 'rutube', id, embed: `https://rutube.ru/play/embed/${id}` }
    expect(parseVideo(`https://rutube.ru/video/${id}/`)).toEqual(expected)
    expect(parseVideo(`https://rutube.ru/play/embed/${id}`)).toEqual(expected)
    expect(parseVideo(id)).toEqual(expected)
    expect(parseVideo(id.toUpperCase())).toEqual(expected)
  })

  it('Rutube: видео по ссылке с ключом доступа', () => {
    const id = '09391c5817d4189bc014b23f904e324c'
    expect(parseVideo(`https://rutube.ru/video/private/${id}/?p=AbC-1_x`).embed).toBe(
      `https://rutube.ru/play/embed/${id}/?p=AbC-1_x`,
    )
  })

  it('Kinescope', () => {
    const expected = { type: 'kinescope', id: 'abcDEF123', embed: 'https://kinescope.io/embed/abcDEF123' }
    expect(parseVideo('https://kinescope.io/abcDEF123')).toEqual(expected)
    expect(parseVideo('https://kinescope.io/embed/abcDEF123')).toEqual(expected)
  })

  it('прямая ссылка на файл', () => {
    expect(parseVideo('https://example.com/lesson.mp4')).toEqual({ type: 'file', src: 'https://example.com/lesson.mp4' })
    expect(parseVideo('https://example.com/a.WEBM?x=1').type).toBe('file')
    expect(parseVideo('https://example.com/a.mov#t=5').type).toBe('file')
  })

  it('пустая и нераспознанная ссылка — null', () => {
    for (const url of ['', '   ', null, undefined, 'https://example.com/page', 'просто текст'])
      expect(parseVideo(url)).toBeNull()
  })

  it('пробелы вокруг ссылки не мешают', () => {
    expect(parseVideo('  https://youtu.be/dQw4w9WgXcQ \n').type).toBe('youtube')
  })
})

describe('allTasks — задачи урока плоским списком', () => {
  it('раскрывает группы и сохраняет порядок', () => {
    const lesson = { tasks: [{ id: 'a' }, { title: 'Группа', tasks: [{ id: 'b' }, { id: 'c' }] }, { id: 'd' }] }
    expect(allTasks(lesson).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('урок без задач и пустая группа', () => {
    expect(allTasks({})).toEqual([])
    expect(allTasks({ tasks: [{ title: 'Пусто', tasks: [] }] })).toEqual([])
  })
})

describe('plural — склонение', () => {
  it('подсказка / подсказки / подсказок', () => {
    const f = (n) => plural(n, 'подсказку', 'подсказки', 'подсказок')
    expect([1, 21, 101].map(f)).toEqual(['подсказку', 'подсказку', 'подсказку'])
    expect([2, 3, 4, 22].map(f)).toEqual(['подсказки', 'подсказки', 'подсказки', 'подсказки'])
    expect([0, 5, 11, 12, 14, 111, 25].map(f)).toEqual(Array(7).fill('подсказок'))
  })
})

describe('emptyTaskState — начальное состояние задачи', () => {
  it('задача ждёт решения, без ошибок, подсказок и XP', () => {
    expect(emptyTaskState).toEqual({
      status: 'pending',
      errors: 0,
      lockUntil: 0,
      hintsUsed: 0,
      answers: [],
      okParts: [],
      xp: 0,
    })
  })
})
