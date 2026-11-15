// Формат сохранённого прогресса и перенос старых сохранений.
//
// Раньше (edu-progress-v1) курс был один, и прогресс лежал плоско:
//   { l1t1: {…состояние задачи…}, 'quiz:l1': { 0: {…ответ на вопрос к видео…} } }
// Теперь (edu-progress-v2) курсов несколько:
//   { version: 2, courses: { '<id курса>': { tasks: { l1t1: {…} }, quiz: { l1: { 0: {…} } } } } }
// Старое сохранение при первом открытии переносится в курс site.legacyCourse.
// Ключ edu-progress-v1 при этом не удаляется — остаётся запасной копией.

export const KEY_V1 = 'edu-progress-v1'
export const KEY_V2 = 'edu-progress-v2'

export const emptyProgress = () => ({ version: 2, courses: {} })
export const emptyCourseProgress = () => ({ tasks: {}, quiz: {} })

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Старый плоский прогресс → новый, внутри курса courseId
export function migrateV1(v1, courseId) {
  const progress = emptyProgress()
  if (!isObject(v1) || !courseId) return progress
  const course = emptyCourseProgress()
  for (const [key, value] of Object.entries(v1)) {
    if (!isObject(value)) continue
    if (key.startsWith('quiz:')) course.quiz[key.slice(5)] = value
    else course.tasks[key] = value
  }
  if (Object.keys(course.tasks).length || Object.keys(course.quiz).length) progress.courses[courseId] = course
  progress.migratedFrom = KEY_V1
  return progress
}

function parse(text) {
  try {
    const value = JSON.parse(text)
    return isObject(value) ? value : null
  } catch {
    return null
  }
}

// kv — хранилище строк { get(key), set(key, value) }: в браузере это localStorage.
// Возвращает прогресс в новом формате; при необходимости переносит старый и сразу сохраняет.
export function readProgress(kv, legacyCourseId) {
  const v2 = parse(kv.get(KEY_V2))
  if (v2 && isObject(v2.courses)) return v2
  const v1 = parse(kv.get(KEY_V1))
  if (!v1) return emptyProgress()
  const migrated = migrateV1(v1, legacyCourseId)
  writeProgress(kv, migrated)
  return migrated
}

export function writeProgress(kv, progress) {
  kv.set(KEY_V2, JSON.stringify(progress))
}

// localStorage может быть недоступен (частный режим, запрет в настройках) — работаем без сохранения
export const browserKv = {
  get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* нет места или нет доступа */
    }
  },
}

// Хранилище в памяти: для предпросмотра в редакторе и для тестов
export function memoryKv(initial = {}) {
  const data = { ...initial }
  return { get: (k) => (k in data ? data[k] : null), set: (k, v) => void (data[k] = String(v)), data }
}

// Сумма XP по сохранённым состояниям задач: по одному курсу или по всем
export function totalXp(progress, courseId) {
  const courses = courseId ? [progress?.courses?.[courseId]] : Object.values(progress?.courses ?? {})
  return courses.reduce((sum, c) => sum + Object.values(c?.tasks ?? {}).reduce((s, t) => s + (t?.xp || 0), 0), 0)
}
