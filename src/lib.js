import { course } from './data/course.js'

// ---------- Видео ----------
// Принимает ссылку на видео и определяет платформу. Понимает:
//   YouTube   — youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/…, /live/…
//   Rutube    — rutube.ru/video/…, rutube.ru/play/embed/… или просто id из 32 символов
//   Kinescope — kinescope.io/… или kinescope.io/embed/…
//   файл      — прямая ссылка на .mp4 / .webm / .m4v / .mov / .ogv
// Возвращает { type, id, embed } для плееров и { type: 'file', src } для файла.
export function parseVideo(input) {
  const url = String(input ?? '').trim()
  if (!url) return null

  let m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/)
  if (m) return { type: 'youtube', id: m[1], embed: `https://www.youtube.com/embed/${m[1]}?rel=0&playsinline=1` }

  m = url.match(/kinescope\.io\/(?:embed\/)?([A-Za-z0-9]+)/)
  if (m) return { type: 'kinescope', id: m[1], embed: `https://kinescope.io/embed/${m[1]}` }

  if (/\.(mp4|webm|m4v|mov|ogv)([?#]|$)/i.test(url)) return { type: 'file', src: url }

  m = url.match(/[0-9a-f]{32}/i)
  if (m) {
    const id = m[0].toLowerCase()
    // У видео «по ссылке» есть ключ доступа ?p=…
    const key = url.match(/[?&]p=([\w-]+)/)
    return { type: 'rutube', id, embed: `https://rutube.ru/play/embed/${id}${key ? `/?p=${key[1]}` : ''}` }
  }
  return null
}

// ---------- Задачи урока ----------
// В списке задач урока могут стоять отдельные задачи и группы { title, tasks: [...] }.
// Эта функция возвращает все задачи урока одним плоским списком.
export function allTasks(lesson) {
  return lesson.tasks.flatMap((t) => (Array.isArray(t.tasks) ? t.tasks : [t]))
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

// ---------- XP ----------
// Цена задачи зависит от уровня сложности. Каждая ошибка и каждая подсказка
// снимают фиксированную часть цены (вычитание, а не умножение — легко посчитать в уме).
// Решил сам — получаешь не меньше minShare от цены. «Я не знаю» — 0.
export function taskMaxXp(task) {
  return task.xp ?? course.levelXp[task.level ?? course.defaultLevel]
}

export const errorCost = (task) => Math.max(1, Math.round(taskMaxXp(task) * course.errorPenalty))
export const hintCost = (task) => Math.max(1, Math.round(taskMaxXp(task) * course.hintPenalty))
export const minXp = (task) => Math.max(1, Math.round(taskMaxXp(task) * course.minShare))

export function calcXp(task, hintsUsed, errors) {
  const raw = taskMaxXp(task) - errors * errorCost(task) - hintsUsed * hintCost(task)
  return Math.max(minXp(task), raw)
}

// Пауза после неверной отправки: с cooldownFromError-й ошибки, каждый раз cooldownSeconds.
export function cooldownAfter(errors) {
  return errors >= course.cooldownFromError ? course.cooldownSeconds * 1000 : 0
}

// Старые сохранения хранили attempts (с учётом верной попытки), новые — errors.
export function errorsOf(state) {
  if (state.errors != null) return state.errors
  return Math.max(0, (state.attempts || 0) - (state.status === 'correct' ? 1 : 0))
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
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
  errors: 0, // сколько раз отправлен неверный ответ
  lockUntil: 0, // до какого момента (ms) нельзя отправлять ответ — пауза от перебора
  hintsUsed: 0,
  answers: [], // введённые ответы по полям
  okParts: [], // какие поля уже решены верно
  xp: 0,
}
