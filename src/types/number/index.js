// Тип задачи «Число»: одно или несколько полей с числовым ответом.
//
// Поля задачи:
//   answer, tolerance                       — одно поле ответа
//   parts: [{ label, answer, tolerance }]   — несколько полей (вместо answer)
// Ученику до ответа отдаются только подписи полей; ответы и допуски — закрытая часть.
import { fmtNumber, parseNumber } from '../../lib.js'

// У задачи может быть одно поле ответа (answer) или несколько (parts).
// Внутри всё приводится к списку полей.
export function getParts(task) {
  return task.parts ?? [{ label: 'Ваш ответ', answer: task.answer, tolerance: task.tolerance }]
}

export function isCorrect(part, raw) {
  const n = parseNumber(raw)
  if (n === null) return false
  return Math.abs(n - part.answer) <= (part.tolerance ?? 0) + 1e-9
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const drop = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

export default {
  id: 'number',
  title: 'Число',
  hint: 'Ученик вводит число. Полей ответа может быть несколько.',
  // Свои поля типа в задаче (при смене типа в редакторе они убираются)
  fields: ['answer', 'tolerance', 'parts'],

  // Одно поле ответа встаёт в одну строку с кнопкой «Ответить»
  inline: (task) => !task.parts,

  // Поля новой задачи в редакторе
  create: () => ({ answer: null }),

  // Что из задачи можно отдать ученику до ответа (pub), а что нельзя (priv)
  split(task) {
    if (task.parts)
      return {
        pub: { parts: task.parts.map((p) => ({ label: p.label })) },
        priv: { parts: task.parts.map((p) => drop({ answer: p.answer, tolerance: p.tolerance })) },
      }
    return { pub: {}, priv: drop({ answer: task.answer, tolerance: task.tolerance }) }
  },

  merge(pub, priv = {}) {
    if (pub.parts) return { parts: pub.parts.map((p, i) => ({ ...p, ...priv.parts?.[i] })) }
    return drop({ answer: priv.answer, tolerance: priv.tolerance })
  },

  // Правила корректности. issue(поле, сообщение, уровень = 'error')
  validate(task, issue) {
    const checkTolerance = (v, field) => {
      if (v !== undefined && v !== null && !(isNum(v) && v >= 0)) issue(field, 'Допуск — число не меньше нуля')
    }
    if (task.parts !== undefined) {
      if (!Array.isArray(task.parts) || task.parts.length === 0) return issue('parts', 'У задачи нет ни одного поля ответа')
      task.parts.forEach((p, i) => {
        if (!String(p?.label ?? '').trim()) issue(`parts/${i}/label`, 'У поля ответа нет подписи')
        if (!isNum(p?.answer)) issue(`parts/${i}/answer`, 'У поля нет ответа — нужно число')
        checkTolerance(p?.tolerance, `parts/${i}/tolerance`)
      })
      return
    }
    if (!isNum(task.answer)) issue('answer', 'У задачи нет ответа — нужно число')
    checkTolerance(task.tolerance, 'tolerance')
  },

  // Пустой ввод: по строке на каждое поле
  emptyInput: (task) => getParts(task).map(() => ''),

  // Проверка отправленного ответа. Возвращает:
  //   { invalid: 'сообщение' }             — ввод не разобран, это не ошибка, XP не снимается
  //   { correct: true,  patch }            — верно; patch дописывается в состояние задачи
  //   { correct: false, patch, note }      — неверно; note — что сказать ученику
  check(task, input, state) {
    const parts = getParts(task)
    const multi = parts.length > 1
    const okParts = state.okParts || []
    const value = (i) => String(input?.[i] ?? '')
    const open = parts.map((_, i) => i).filter((i) => !okParts[i])

    if (open.some((i) => !value(i).trim())) return { invalid: multi ? 'Заполните все поля ответа' : 'Введите ответ' }
    // Не число — это опечатка, а не ошибка в решении
    if (open.some((i) => parseNumber(value(i)) === null))
      return {
        invalid: 'Ответ должен быть числом, например 12, −6 или 2,5 — без единиц измерения. XP за это не снимается.',
      }

    const nowOk = parts.map((p, i) => Boolean(okParts[i]) || isCorrect(p, value(i)))
    if (nowOk.every(Boolean)) return { correct: true, patch: { answers: parts.map((p) => fmtNumber(p.answer)), okParts: nowOk } }

    // Верные поля фиксируются; ошибка одна на отправку, сколько бы полей ни было неверно
    const wrongCount = nowOk.filter((v) => !v).length
    return { correct: false, patch: { okParts: nowOk }, note: multi ? `Неверных ответов: ${wrongCount}` : 'Неверно' }
  },

  // «Я не знаю»: уже решённые поля остаются с верным ответом
  onSkip(task, state) {
    const okParts = state.okParts || []
    return { answers: getParts(task).map((p, i) => (okParts[i] ? fmtNumber(p.answer) : '')) }
  },

  // Что из ответа можно показать ученику при этом состоянии задачи:
  // верные значения уже решённых полей, а после завершения — все.
  reveal(task, state, done) {
    const okParts = state.okParts || []
    return { parts: getParts(task).map((p, i) => (done || okParts[i] ? fmtNumber(p.answer) : null)) }
  },
}
