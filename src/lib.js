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

export const maxAttempts = course.attemptMultipliers.length

// ---------- XP ----------
// Без подсказок и с первой попытки — максимум.
// Каждая подсказка снимает долю XP, а каждая ошибка уменьшает награду
// по шкале course.attemptMultipliers (штраф с каждой попыткой всё мягче).
export function taskMaxXp(task) {
  return task.xp ?? course.defaultTaskXp
}

export function calcXp(task, hintsUsed, attemptNumber) {
  const max = taskMaxXp(task)
  const hintFactor = 1 - hintsUsed / (task.hints.length + 1)
  const m = course.attemptMultipliers
  const attemptFactor = m[Math.min(attemptNumber, m.length) - 1]
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

export const emptyTaskState = {
  status: 'pending',
  attempts: 0,
  hintsUsed: 0,
  answers: [], // введённые ответы по полям
  okParts: [], // какие поля уже решены верно
  xp: 0,
}
