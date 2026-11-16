// Серия заданий: ровно 10, в случайном порядке, с повтором ошибок. Чистые функции без React и без Math.random
// по умолчанию в самих правилах — случайность приходит параметром rng (в тестах она подменяется).
//
// Задание в серии — «слот»: { id, mirror, variant, repeat }
//   id      — номер ситуации (как в ключе, «1.2»)
//   mirror  — отражено ли зеркально;  variant — вариант вида (угол склона)
//   repeat  — это повтор после ошибки
// Ситуации для серии передаются списком pool: { id, mirrorable, variants }.
//
// Правило повтора (решение преподавателя): серия всегда из 10 слотов. Ошибка в задании возвращает эту
// же ситуацию позже, в зеркальном виде и с другим углом, и повтор занимает место ещё не показанного
// задания, а не удлиняет серию. Повтор тоже считается в «✓ N из 10». Ошибка в повторе нового повтора
// не создаёт; ошибка в последнем слоте повтора не получает (слотов позже не осталось).
export const SERIES_LENGTH = 10
// Повтор встаёт не следующим заданием (ответ ещё в памяти), а через 2–4 задания, если слотов хватает
const REPEAT_WINDOW = [2, 4]

const int = (rng, n) => Math.min(n - 1, Math.floor(rng() * n))

export function shuffle(list, rng = Math.random) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(rng, i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function startSeries(pool, { rng = Math.random, length = SERIES_LENGTH } = {}) {
  let order = []
  while (order.length < length) order = order.concat(shuffle(pool, rng))
  const slots = order.slice(0, length).map((s) => ({
    id: s.id,
    mirror: s.mirrorable ? rng() < 0.5 : false,
    variant: int(rng, s.variants ?? 1),
    repeat: false,
  }))
  return { slots, pos: 0, results: [] }
}

function scheduleRepeat(slots, pos, pool, rng) {
  const failed = slots[pos]
  const sit = pool.find((s) => s.id === failed.id)
  const open = (j) => j > pos && j < slots.length && !slots[j].repeat
  const [from, to] = REPEAT_WINDOW
  let candidates = []
  for (let j = pos + from; j <= pos + to; j++) if (open(j)) candidates.push(j)
  if (!candidates.length) for (let j = pos + 1; j < slots.length; j++) if (open(j)) candidates.push(j)
  if (!candidates.length || !sit) return slots
  const at = candidates[int(rng, candidates.length)]
  const variants = sit.variants ?? 1
  const next = [...slots]
  next[at] = {
    id: failed.id,
    mirror: sit.mirrorable ? !failed.mirror : false,
    variant: variants > 1 ? (failed.variant + 1 + int(rng, variants - 1)) % variants : failed.variant,
    repeat: true,
  }
  return next
}

// Записать результат текущего задания (ok — верно с первой попытки на обоих шагах) и перейти к следующему
export function answer(series, ok, pool, rng = Math.random) {
  const { slots, pos } = series
  if (pos >= slots.length) return series
  const next = !ok && !slots[pos].repeat ? scheduleRepeat(slots, pos, pool, rng) : slots
  return { slots: next, pos: pos + 1, results: [...series.results, Boolean(ok)] }
}

export const current = (series) => series.slots[series.pos] ?? null

export function stats(series) {
  const answered = series.results.length
  return {
    total: series.slots.length,
    answered,
    correct: series.results.filter(Boolean).length,
    finished: answered >= series.slots.length,
  }
}
