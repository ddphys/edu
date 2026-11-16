// Формат файла данных бланка (ege-данные.json) и слияние копий. Чистые функции.
//
// { app: 'ege-blank', version: 1, savedAt, students: { id: {...} }, exams: { id: {...} }, deleted: { 'exams/<id>': время } }
//
// У каждой записи есть _t — время последнего изменения (мс). При слиянии двух копий побеждает
// более новая версия записи, а удалённое (deleted) не возвращается из старой копии.

export const APP = 'ege-blank'
export const KINDS = ['students', 'exams']

export const blank = () => ({ students: {}, exams: {}, deleted: {} })

// Привести что угодно к формату: лишнее отбрасывается, битые записи пропускаются
export function norm(o) {
  const r = blank()
  if (!o || typeof o !== 'object') return r
  for (const k of KINDS) {
    const s = o[k]
    if (s && typeof s === 'object') for (const id of Object.keys(s)) if (s[id] && typeof s[id] === 'object' && !Array.isArray(s[id])) r[k][id] = s[id]
  }
  if (o.deleted && typeof o.deleted === 'object')
    for (const k of Object.keys(o.deleted)) {
      const t = +o.deleted[k]
      if (t > 0) r.deleted[k] = t
    }
  return r
}

// Похоже ли на файл бланка. Чужой или повреждённый JSON не перезаписываем.
export function isOurs(o) {
  return !!o && typeof o === 'object' && !Array.isArray(o) && (o.app === APP || (!!o.students && typeof o.students === 'object') || (!!o.exams && typeof o.exams === 'object'))
}

export const count = (s) => Object.keys(s.students).length + Object.keys(s.exams).length

const ts = (d) => (d && +d._t) || 0

// Слить две копии, ничего не потеряв
export function merge(a, b) {
  const r = blank()
  for (const dl of [a.deleted, b.deleted]) for (const k of Object.keys(dl)) if (!(r.deleted[k] >= dl[k])) r.deleted[k] = dl[k]
  for (const c of KINDS) {
    const ids = new Set([...Object.keys(a[c]), ...Object.keys(b[c])])
    for (const id of ids) {
      const x = a[c][id], y = b[c][id]
      const d = !x ? y : !y ? x : ts(x) > ts(y) ? x : y
      const del = r.deleted[`${c}/${id}`]
      if (del && del >= ts(d)) continue
      r[c][id] = d
    }
  }
  return r
}

export function serialize(s, now = new Date()) {
  return JSON.stringify({ app: APP, version: 1, savedAt: now.toISOString(), students: s.students, exams: s.exams, deleted: s.deleted }, null, 1)
}

// Разобрать текст файла. Пустой файл — null, чужой — ошибка SyntaxError.
export function parseText(text) {
  if (!String(text ?? '').trim()) return null
  const o = JSON.parse(text)
  if (!isOurs(o)) throw new SyntaxError('not ege-blank')
  return norm(o)
}

// Записи в виде списков для интерфейса: id внутри записи, у пробника всегда есть scores
export function toLists(s) {
  const list = (c) =>
    Object.keys(s[c]).map((id) => {
      const { _t, ...rest } = s[c][id]
      const o = { ...rest, id }
      if (c === 'exams') o.scores = o.scores ?? {}
      return o
    })
  return { students: list('students'), exams: list('exams') }
}

// Транслитерация имени файла: браузеры и мессенджеры не везде дружат с кириллицей в имени
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }
export function asciiName(n) {
  return [...String(n)]
    .map((ch) => {
      const l = ch.toLowerCase()
      if (TR[l] === undefined) return ch
      const t = TR[l]
      return ch === l ? t : t.charAt(0).toUpperCase() + t.slice(1)
    })
    .join('')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-(?=\.)/g, '')
}
