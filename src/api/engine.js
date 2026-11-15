// Правила прохождения задачи — общие для всех типов: подсказка, отправка ответа, «Я не знаю».
// Чистые функции: получают полную задачу (с ответами) и состояние, возвращают новое состояние.
// Сейчас их вызывает локальная реализация интерфейса (local.js) прямо в браузере,
// позже эти же функции будет вызывать сервер.
import { calcXp, cooldownAfter, normalizeState } from '../lib.js'
import { typeOf } from '../types/index.js'

export const isDone = (state) => (state?.status ?? 'pending') !== 'pending'
export const normalize = normalizeState

// Что ученику можно показать при текущем состоянии задачи:
// открытые подсказки, после завершения — разбор и верные ответы.
export function revealedFor(task, state) {
  const s = normalize(state)
  const done = isDone(s)
  return {
    hints: (task.hints ?? []).slice(0, s.hintsUsed),
    solution: done ? (task.solution ?? null) : null,
    answer: typeOf(task)?.reveal(task, s, done) ?? null,
  }
}

export function applyHint(task, state) {
  const s = normalize(state)
  if (isDone(s) || s.hintsUsed >= (task.hints ?? []).length) return { kind: 'noop', state: s }
  return { kind: 'hint', state: { ...s, hintsUsed: s.hintsUsed + 1 } }
}

// Результат отправки:
//   noop    — задача уже завершена
//   locked  — идёт пауза от перебора
//   invalid — ввод не разобран (message); это не ошибка, XP не снимается
//   correct — верно, в state.xp начисленный опыт
//   wrong   — неверно: note — что сказать ученику, xpLost — на сколько упала награда
export function applySubmit(course, task, state, input, now) {
  const s = normalize(state)
  if (isDone(s)) return { kind: 'noop', state: s }
  if ((s.lockUntil || 0) > now) return { kind: 'locked', state: s }

  const type = typeOf(task)
  const result = type.check(task, input, s)
  if (result.invalid) return { kind: 'invalid', message: result.invalid, state: s }

  const errors = s.errors
  const potential = calcXp(task, course, s.hintsUsed, errors)
  if (result.correct)
    return { kind: 'correct', state: { ...s, ...result.patch, status: 'correct', errors, xp: potential, lockUntil: 0 } }

  const nextErrors = errors + 1
  const pause = cooldownAfter(nextErrors, course)
  return {
    kind: 'wrong',
    note: result.note ?? 'Неверно',
    xpLost: potential - calcXp(task, course, s.hintsUsed, nextErrors),
    state: { ...s, ...result.patch, errors: nextErrors, lockUntil: pause ? now + pause : 0 },
  }
}

// «Я не знаю»: открывает ответ и разбор, XP за задачу — 0
export function applySkip(task, state) {
  const s = normalize(state)
  if (isDone(s)) return { kind: 'noop', state: s }
  return { kind: 'skipped', state: { ...s, ...typeOf(task).onSkip(task, s), status: 'skipped', xp: 0, lockUntil: 0 } }
}

// Ответ на вопрос по ходу видео. saved — что уже сохранено по этому вопросу.
export function applyQuizAnswer(question, saved, choice, { retry = false } = {}) {
  const ok = choice === question.correct
  return retry ? { choice, ok, retried: true } : { ...saved, choice, ok }
}
