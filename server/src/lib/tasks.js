// Логика проверки ответов и начисления XP. Повторяет правила из README.

export function parseNumber(s) {
  const raw = String(s ?? '').trim()
  if (!raw) return null
  const n = Number(raw.replace(/\s+/g, '').replace(',', '.').replace('−', '-'))
  return Number.isFinite(n) ? n : null
}

export function isCorrect(part, raw) {
  const n = parseNumber(raw)
  if (n === null) return false
  return Math.abs(n - Number(part.answer)) <= Number(part.tolerance ?? 0) + 1e-9
}

export const fmt = (n) => String(n).replace('.', ',')

export const taskMaxXp = (task, course) => task.xp ?? course.default_task_xp

export const maxAttempts = (course) => course.attempt_multipliers.length

export function calcXp(task, course, hintsUsed, attemptNumber) {
  const max = taskMaxXp(task, course)
  const hintFactor = 1 - hintsUsed / (task.hints.length + 1)
  const m = course.attempt_multipliers
  const attemptFactor = m[Math.min(attemptNumber, m.length) - 1]
  return Math.max(1, Math.round(max * hintFactor * attemptFactor))
}

export const emptyState = () => ({
  status: 'pending',
  attempts: 0,
  hints_used: 0,
  answers: [],
  ok_parts: [],
  xp: 0,
})

// Проверка ответа. answers — введённые строки по полям (для уже верных полей игнорируются).
// Возвращает новое состояние и информацию для сообщения ученику.
export function checkAnswer(task, course, state, answers) {
  if (state.status !== 'pending') return { state, error: 'Задача уже завершена' }
  const parts = task.parts
  const ok = parts.map((_, i) => Boolean(state.ok_parts[i]))
  const input = parts.map((_, i) => String(answers?.[i] ?? '').slice(0, 100))
  const open = parts.map((_, i) => i).filter((i) => !ok[i])
  if (open.some((i) => !input[i].trim())) return { state, error: 'Заполните все поля ответа' }

  const attemptNumber = state.attempts + 1
  const nowOk = parts.map((p, i) => ok[i] || isCorrect(p, input[i]))
  const shown = parts.map((p, i) => (nowOk[i] ? fmt(p.answer) : input[i]))
  const correct = nowOk.every(Boolean)
  const limit = maxAttempts(course)

  let next
  if (correct) {
    next = {
      ...state,
      status: 'correct',
      attempts: attemptNumber,
      answers: shown,
      ok_parts: nowOk,
      xp: calcXp(task, course, state.hints_used, attemptNumber),
    }
  } else if (attemptNumber >= limit) {
    next = { ...state, status: 'wrong', attempts: attemptNumber, answers: shown, ok_parts: nowOk, xp: 0 }
  } else {
    next = { ...state, attempts: attemptNumber, answers: shown.map((v, i) => (nowOk[i] ? v : '')), ok_parts: nowOk }
  }
  return {
    state: next,
    input,
    correct,
    wrongCount: nowOk.filter((v) => !v).length,
    attemptsLeft: limit - attemptNumber,
    nextXp: next.status === 'pending' ? calcXp(task, course, state.hints_used, attemptNumber + 1) : null,
  }
}

// Задача в том виде, в каком её видит ученик: без ответов и решения, пока не завершена.
export function studentTask(task, course, state) {
  const done = state.status !== 'pending'
  return {
    id: task.id,
    title: task.title,
    text: task.text,
    parts: task.parts.map((p, i) => ({
      label: p.label || '',
      answer: done || state.ok_parts[i] ? fmt(p.answer) : null,
    })),
    hintsTotal: task.hints.length,
    hints: task.hints.slice(0, state.hints_used),
    solution: done ? task.solution : null,
    maxXp: taskMaxXp(task, course),
    potentialXp: done ? null : calcXp(task, course, state.hints_used, state.attempts + 1),
    maxAttempts: maxAttempts(course),
    state: {
      status: state.status,
      attempts: state.attempts,
      hintsUsed: state.hints_used,
      answers: state.answers,
      okParts: state.ok_parts,
      xp: state.xp,
    },
  }
}

// Нормализация полей ответа при сохранении из редактора
export function normalizeParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('Нужно хотя бы одно поле ответа')
  return parts.map((p, i) => {
    const answer = typeof p?.answer === 'number' ? p.answer : parseNumber(p?.answer)
    if (answer === null || !Number.isFinite(answer)) throw new Error(`Поле ответа ${i + 1}: ответ должен быть числом`)
    const t = p?.tolerance
    const tol = t === '' || t == null ? 0 : typeof t === 'number' ? t : parseNumber(t)
    if (tol === null || !(tol >= 0)) throw new Error(`Поле ответа ${i + 1}: неверная погрешность`)
    return { label: String(p?.label ?? '').slice(0, 500), answer, tolerance: tol }
  })
}
