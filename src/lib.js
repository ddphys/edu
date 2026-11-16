// Чистые функции без обращения к контенту и хранилищу: их одинаково используют
// страница ученика, редактор, проверка контента при сборке и (позже) сервер.

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

export const VIDEO_PLATFORMS = { youtube: 'YouTube', rutube: 'Rutube', kinescope: 'Kinescope', file: 'видеофайл' }

// ---------- Задачи урока ----------
// В списке задач урока могут стоять отдельные задачи и группы { title, tasks: [...] }.
export const isGroup = (item) => Array.isArray(item?.tasks)

// Все задачи урока одним плоским списком.
export function allTasks(lesson) {
  return (lesson?.tasks ?? []).flatMap((t) => (isGroup(t) ? t.tasks : [t]))
}

// Все задачи курса одним плоским списком.
export function courseTasks(course) {
  return (course?.lessons ?? []).flatMap(allTasks)
}

// ---------- Разбор числа ----------
// Понимает число так, как его набирают люди:
//   пробелы (в том числе неразрывные) не учитываются — « 1 000 », «- 6»;
//   дефис, минус и тире — один и тот же знак: -6, −6, –6, —6;
//   точка и запятая равнозначны: 2.5 и 2,5.
// Всё, что не число («8 м/с», «abc», «1e3»), даёт null.
export function parseNumber(s) {
  const t = String(s ?? '')
    .replace(/\s/g, '')
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/[,，]/g, '.')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null
  return Number(t)
}

// Число так, как его видит ученик: с запятой
export const fmtNumber = (n) => String(n).replace('.', ',')

// На айфоне у цифровой клавиатуры нет минуса, поэтому там открываем обычную
export const answerInputMode =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
    ? 'text'
    : 'decimal'

// ---------- XP ----------
// Настройки XP лежат в курсе (course). Это значения по умолчанию для нового курса.
export const DEFAULT_XP_RULES = {
  // Цена задачи по уровню сложности (level: 1 — очень простая … 5 — очень сложная)
  levelXp: { 1: 5, 2: 10, 3: 20, 4: 35, 5: 50 },
  defaultLevel: 2,
  // Штрафы — доля от цены задачи
  errorPenalty: 0.2,
  hintPenalty: 0.25,
  // Если ученик в итоге решил сам, он получает не меньше этой доли
  minShare: 0.25,
  // Защита от перебора: начиная с этой ошибки после каждой неверной отправки — пауза
  cooldownFromError: 3,
  cooldownSeconds: 20,
}

// Цена задачи зависит от уровня сложности. Каждая ошибка и каждая подсказка
// снимают фиксированную часть цены (вычитание, а не умножение — легко посчитать в уме).
// Решил сам — получаешь не меньше minShare от цены. «Я не знаю» — 0.
export function taskMaxXp(task, course) {
  return task.xp ?? course.levelXp[task.level ?? course.defaultLevel]
}

export const errorCost = (task, course) => Math.max(1, Math.round(taskMaxXp(task, course) * course.errorPenalty))
export const hintCost = (task, course) => Math.max(1, Math.round(taskMaxXp(task, course) * course.hintPenalty))
export const minXp = (task, course) => Math.max(1, Math.round(taskMaxXp(task, course) * course.minShare))

export function calcXp(task, course, hintsUsed, errors) {
  const raw = taskMaxXp(task, course) - errors * errorCost(task, course) - hintsUsed * hintCost(task, course)
  return Math.max(minXp(task, course), raw)
}

// Пауза после неверной отправки: с cooldownFromError-й ошибки, каждый раз cooldownSeconds.
export function cooldownAfter(errors, course) {
  return errors >= course.cooldownFromError ? course.cooldownSeconds * 1000 : 0
}

// ---------- Состояние задачи ----------
export const emptyTaskState = {
  status: 'pending',
  errors: 0, // сколько раз отправлен неверный ответ
  lockUntil: 0, // до какого момента (ms) нельзя отправлять ответ — пауза от перебора
  hintsUsed: 0,
  answers: [], // введённые ответы (что именно здесь лежит — решает тип задачи)
  okParts: [], // какие поля уже решены верно
  xp: 0,
}

// Старые сохранения хранили attempts (с учётом верной попытки), новые — errors.
export function errorsOf(state) {
  if (state.errors != null) return state.errors
  return Math.max(0, (state.attempts || 0) - (state.status === 'correct' ? 1 : 0))
}

// Сохранённое состояние → полное: недостающие поля берутся из пустого состояния,
// число ошибок — с учётом старых сохранений.
export function normalizeState(state) {
  return { ...emptyTaskState, ...state, errors: errorsOf(state ?? {}) }
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
