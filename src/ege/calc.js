// Расчёты бланка ЕГЭ. Чистые функции, без браузера: их можно запускать и на сервере.
import { EGE } from './config.js'

export const TASKS = EGE.maxes.length
export const TOTAL = EGE.maxes.reduce((a, b) => a + b, 0)
export const PART1_MAX = EGE.maxes.slice(0, EGE.part1).reduce((a, b) => a + b, 0)
export const PART2_MAX = TOTAL - PART1_MAX

// Номер задания → тема
export const TOPIC_OF = Object.fromEntries(EGE.topics.flatMap((t) => t.tasks.map((n) => [n, t])))

export const SKIP = -1 // «не решал»: 0 баллов, задание считается проверенным

// Состояние задания для цвета: full / mid / zero / skip / '' (не проверено)
export function kindOf(v, max) {
  if (v == null) return ''
  if (v === SKIP) return 'skip'
  if (v === max) return 'full'
  if (v === 0) return 'zero'
  return 'mid'
}

// Тестовый балл по первичному
export const toTest = (p) => EGE.scale[Math.max(0, Math.min(TOTAL, p))]

// Минимальный первичный балл, который даёт не меньше test тестовых
export function primaryFor(test) {
  for (let p = 0; p <= TOTAL; p++) if (EGE.scale[p] >= test) return p
  return TOTAL
}

// Итог пробника: первичный, тестовый, части, потери, баллы по темам
export function calc(exam) {
  const sc = exam?.scores ?? {}
  const topics = Object.fromEntries(EGE.topics.map((t) => [t.id, { got: 0, lost: 0, max: 0 }]))
  let p = 0, lost = 0, checked = 0, skipped = 0, p1 = 0, p2 = 0
  EGE.maxes.forEach((m, i) => {
    const n = i + 1
    const T = topics[TOPIC_OF[n].id]
    T.max += m
    const raw = sc[n]
    if (raw == null) return
    checked++
    if (+raw === SKIP) {
      skipped++
      lost += m
      T.lost += m
      return
    }
    const v = Math.max(0, Math.min(m, Math.round(+raw) || 0))
    p += v
    lost += m - v
    T.got += v
    T.lost += m - v
    if (i < EGE.part1) p1 += v
    else p2 += v
  })
  return { p, test: toTest(p), lost, checked, skipped, p1, p2, topics }
}

// Пробники ученика по порядку: по дате, при равной дате по времени создания
export function examsOf(exams, studentId) {
  return exams
    .filter((e) => e.studentId === studentId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0))
}

export const sortStudents = (students) => students.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'))

// Даты
const pad = (n) => String(n).padStart(2, '0')
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const okDate = (s) => /^\d{4}-\d\d-\d\d$/.test(s || '')
export const dShort = (s) => (okDate(s) ? `${s.slice(8)}.${s.slice(5, 7)}` : '')
export const dFull = (s) => (okDate(s) ? `${s.slice(8)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '')

export const clampGoal = (g) => {
  const n = parseInt(g, 10)
  return Number.isNaN(n) ? EGE.defaultGoal : Math.max(EGE.minTest, Math.min(100, n))
}

export const goalOf = (st) => st?.goal || EGE.defaultGoal
