// Журнал попыток: что именно ученик отвечал и сколько думал. Нужен для «Работы над ошибками»
// (см. docs/work-on-errors.md): по числу ошибок причину не понять, по самим ответам — можно.
//
// Журнал — плоский список событий в порядке времени:
//   { at, course, task, kind, input?, ms?, hints, errors }
//     at      — время события, мс
//     kind    — 'wrong' (неверный ответ) | 'correct' | 'invalid' (ввод не разобран, например «8 м/с»)
//               | 'hint' (взята подсказка) | 'skip' («Я не знаю») | 'reset' (прогресс курса сброшен)
//     input   — что отправил ученик, как есть: у «Числа» строки по полям, у «Выбора» номера вариантов
//     ms      — сколько времени задача была на экране с прошлого события по ней (считает страница)
//     hints, errors — сколько подсказок и ошибок по задаче стало после события
// Сейчас журнал лежит в браузере ученика (ключ edu-attempts-v1) и сброс прогресса его не стирает.
// С сервером эти же события будут уходить туда.

export const KEY_ATTEMPTS = 'edu-attempts-v1'

// Больше событий не храним: у localStorage мало места. Старые вытесняются новыми.
export const MAX_EVENTS = 5000
// Длиннее ответ быть не может — это мусор или случайная вставка
const MAX_TEXT = 120
const MAX_ITEMS = 20
// Вкладку могли оставить открытой на ночь — такое время не считаем временем над задачей
const MAX_MS = 60 * 60 * 1000

export const emptyJournal = () => ({ version: 1, events: [] })

export function readJournal(kv) {
  try {
    const value = JSON.parse(kv.get(KEY_ATTEMPTS))
    if (value && Array.isArray(value.events)) return { version: 1, events: value.events }
  } catch {
    /* журнала нет или он повреждён — начинаем новый */
  }
  return emptyJournal()
}

export function writeJournal(kv, journal) {
  kv.set(KEY_ATTEMPTS, JSON.stringify(journal))
}

// Ввод ученика в том виде, в каком его безопасно хранить
function cleanInput(input) {
  const one = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : String(v ?? '').trim().slice(0, MAX_TEXT))
  return Array.isArray(input) ? input.slice(0, MAX_ITEMS).map(one) : [one(input)]
}

const cleanMs = (ms) => (Number.isFinite(ms) && ms > 0 ? Math.min(Math.round(ms), MAX_MS) : undefined)

// Дописать событие. Возвращает тот же журнал (он изменяется на месте).
export function addEvent(journal, { at, course, task, kind, input, ms, hints, errors }) {
  const event = { at, course }
  if (task !== undefined) event.task = task
  event.kind = kind
  if (input !== undefined) event.input = cleanInput(input)
  if (cleanMs(ms) !== undefined) event.ms = cleanMs(ms)
  if (hints !== undefined) event.hints = hints
  if (errors !== undefined) event.errors = errors
  journal.events.push(event)
  if (journal.events.length > MAX_EVENTS) journal.events.splice(0, journal.events.length - MAX_EVENTS)
  return journal
}

// Сводка по задачам курса: что по каждой задаче увидит преподаватель и получит разбор на сервере.
// Считается с последнего сброса прогресса курса. Задачи без ошибок, подсказок и «Я не знаю» не попадают.
//   { [id задачи]: { wrong: [неверные ответы по порядку], invalid: [неразобранный ввод],
//                    hints, skipped, solved, ms: всего времени, lastAt } }
export function summarize(journal, courseId) {
  let events = journal.events.filter((e) => e.course === courseId)
  const reset = events.findLastIndex((e) => e.kind === 'reset')
  if (reset !== -1) events = events.slice(reset + 1)

  const tasks = {}
  for (const e of events) {
    if (!e.task) continue
    const t = (tasks[e.task] ??= { wrong: [], invalid: [], hints: 0, skipped: false, solved: false, ms: 0, lastAt: 0 })
    if (e.kind === 'wrong') t.wrong.push(e.input ?? [])
    if (e.kind === 'invalid') t.invalid.push(e.input ?? [])
    if (e.kind === 'hint') t.hints += 1
    if (e.kind === 'skip') t.skipped = true
    if (e.kind === 'correct') t.solved = true
    t.ms += e.ms ?? 0
    t.lastAt = Math.max(t.lastAt, e.at ?? 0)
  }
  return Object.fromEntries(Object.entries(tasks).filter(([, t]) => t.wrong.length || t.hints || t.skipped))
}
