import { course } from './data/course.js'

// ---------- Rutube ----------
// Принимает ссылку любого вида (video / play/embed) или просто id, возвращает ссылку для iframe.
export function rutubeEmbedUrl(input) {
  if (!input) return null
  const m = String(input).match(/[0-9a-f]{32}/i)
  return m ? `https://rutube.ru/play/embed/${m[0].toLowerCase()}` : null
}

// ---------- Проверка ответа ----------
export function parseNumber(s) {
  const n = Number(String(s).trim().replace(/\s+/g, '').replace(',', '.').replace('−', '-'))
  return Number.isFinite(n) ? n : null
}

export function isCorrect(task, raw) {
  const n = parseNumber(raw)
  if (n === null) return false
  const tol = task.tolerance ?? 0
  return Math.abs(n - task.answer) <= tol + 1e-9
}

// ---------- XP ----------
// Без подсказок и с первой попытки — максимум.
// Каждая подсказка снимает долю XP, вторая попытка снижает вдвое.
export function taskMaxXp(task) {
  return task.xp ?? course.defaultTaskXp
}

export function calcXp(task, hintsUsed, attemptNumber) {
  const max = taskMaxXp(task)
  const hintFactor = 1 - hintsUsed / (task.hints.length + 1)
  const attemptFactor = attemptNumber > 1 ? 0.5 : 1
  return Math.max(1, Math.round(max * hintFactor * attemptFactor))
}

// ---------- Состояние (localStorage) ----------
const KEY = 'edu-progress-v1'

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* localStorage может быть недоступен — работаем без сохранения */
  }
}

export const emptyTaskState = { status: 'pending', attempts: 0, hintsUsed: 0, answer: '', xp: 0 }
