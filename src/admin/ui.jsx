import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'

// ---------- Загрузка данных ----------
export function useLoad(url, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => {
    if (!url) return Promise.resolve()
    return api
      .get(url)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps])
  useEffect(() => {
    reload()
  }, [reload])
  return { data, error, reload, setData }
}

// ---------- Уведомления ----------
const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random()
    setItems((x) => [...x, { id, text, kind }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'err' ? 6000 : 2500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// Выполнить действие с API и показать ошибку/успех
export function useAction() {
  const toast = useToast()
  return useCallback(
    async (fn, okText) => {
      try {
        const r = await fn()
        if (okText) toast(okText)
        return r ?? true
      } catch (e) {
        toast(e.message, 'err')
        return null
      }
    },
    [toast],
  )
}

// ---------- Форматирование ----------
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
export const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'
export function fmtAgo(d) {
  if (!d) return '—'
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return 'сейчас'
  if (s < 3600) return `${Math.floor(s / 60)} мин`
  if (s < 86400) return `${Math.floor(s / 3600)} ч`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} дн`
  return fmtDate(d)
}
export const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')

// ---------- Боковая панель ----------
export function Drawer({ title, onClose, children, width = 1100, actions }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" style={{ width: `min(${width}px, 100vw)` }}>
        <div className="drawer__head">
          <b>{title}</b>
          <span className="drawer__actions">
            {actions}
            <button className="b" onClick={onClose} title="Закрыть (Esc)">
              ✕
            </button>
          </span>
        </div>
        <div className="drawer__body">{children}</div>
      </div>
    </div>
  )
}

// ---------- Ячейка с редактированием по клику ----------
export function EditCell({ value, onSave, multiline = false, placeholder = '' }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  if (!edit)
    return (
      <div className={`editcell ${value ? '' : 'editcell--empty'}`} onClick={() => setEdit(true)} title="Нажмите, чтобы изменить">
        {value || placeholder || '…'}
      </div>
    )
  const save = async () => {
    setEdit(false)
    if (v !== (value ?? '')) await onSave(v)
  }
  const props = {
    autoFocus: true,
    value: v,
    onChange: (e) => setV(e.target.value),
    onBlur: save,
    onKeyDown: (e) => {
      if (e.key === 'Escape') {
        setV(value ?? '')
        setEdit(false)
      }
      if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        save()
      }
    },
  }
  return multiline ? <textarea rows={3} {...props} /> : <input {...props} />
}

// ---------- Сортировка таблиц ----------
export function useSort(rows, initial, getters = {}) {
  const [sort, setSort] = useState(initial)
  const sorted = useMemo(() => {
    if (!rows || !sort) return rows || []
    const [key, dir] = sort
    const get = getters[key] || ((r) => r[key])
    return [...rows].sort((a, b) => {
      const x = get(a)
      const y = get(b)
      if (x === y) return 0
      if (x === null || x === undefined || x === '') return 1
      if (y === null || y === undefined || y === '') return -1
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ru')
      return dir === 'asc' ? r : -r
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])
  const Th = ({ k, children, className = '', title }) => (
    <th
      className={`sortable ${className} ${sort?.[0] === k ? 'is-sorted' : ''}`}
      title={title}
      onClick={() => setSort(sort?.[0] === k ? [k, sort[1] === 'asc' ? 'desc' : 'asc'] : [k, 'desc'])}
    >
      {children}
      {sort?.[0] === k ? (sort[1] === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )
  return { sorted, Th }
}

// Вставка текста в textarea в позицию курсора
export function insertAtCursor(el, text, setValue) {
  if (!el) return
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  setValue(next)
  requestAnimationFrame(() => {
    el.focus()
    el.selectionStart = el.selectionEnd = start + text.length
  })
}

export function useLatest(v) {
  const r = useRef(v)
  r.current = v
  return r
}

export const STATUS_LABEL = { pending: 'в процессе', correct: 'верно', wrong: 'неверно', skipped: 'не знаю' }
export const ROLE_LABEL = { admin: 'админ', teacher: 'преподаватель', student: 'ученик' }
