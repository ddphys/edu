import { createContext, useContext, useEffect, useRef, useState } from 'react'
import MathText from '../components/Math.jsx'
import { imageMarkup } from '../content/text.js'
import { fmtNumber, parseNumber } from '../lib.js'

// Общее состояние редактора: черновик, картинки, замечания (собирается в Admin.jsx)
export const AdminContext = createContext(null)
export const useAdmin = () => useContext(AdminContext)

// Как назвать картинку, вставленную из буфера обмена: у неё нет своего имени («image.png»),
// поэтому берём id задачи или вопроса, в который её вставили.
export const ImageHint = createContext('')
const NAMELESS = /^(image|изображение|pasted[ _-]?image|без[ _]?названия|untitled)\b/i

// Картинки из буфера обмена или из перетащенных файлов
export const imageFiles = (dataTransfer) => [...(dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'))

// Замечания проверки корректности, относящиеся к полю с адресом path
export function Issues({ path }) {
  const { issuesByPath, update } = useAdmin()
  const list = issuesByPath.get(path)
  if (!list) return null
  return (
    <div className="adm-issues">
      {list.map((issue, i) => (
        <div key={i} className={`adm-issue adm-issue--${issue.level}`}>
          {issue.message}
          {issue.fix && (
            <button type="button" className="adm-link" onClick={() => update(issue.fix.apply)}>
              {issue.fix.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function Field({ label, path, hint, children, className = '' }) {
  return (
    <div className={`adm-field ${className}`} data-path={path}>
      {label && <div className="adm-label">{label}</div>}
      {children}
      {hint && <div className="adm-hint">{hint}</div>}
      {path && <Issues path={path} />}
    </div>
  )
}

export function Text({ label, path, hint, value, onChange, placeholder, className }) {
  return (
    <Field label={label} path={path} hint={hint} className={className}>
      <input className="adm-input" aria-label={label} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export function Area({ label, path, hint, value, onChange, placeholder, rows = 3 }) {
  return (
    <Field label={label} path={path} hint={hint}>
      <textarea className="adm-input" aria-label={label} rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

// Поле, у которого набираемый текст и сохраняемое значение — разные вещи (число, список строк).
// Пока человек печатает, показываем его текст; снаружи значение меняется — подхватываем.
function useDraftText(value, format) {
  const [text, setText] = useState(() => format(value))
  const committed = useRef(value)
  useEffect(() => {
    if (!Object.is(value, committed.current) && JSON.stringify(value) !== JSON.stringify(committed.current)) {
      committed.current = value
      setText(format(value))
    }
  }, [value, format])
  return [text, setText, (v) => (committed.current = v)]
}

const fmtNum = (v) => (v == null ? '' : typeof v === 'number' ? fmtNumber(v) : String(v))

// Числовое поле. Понимает запятую и минус-тире, как поле ответа у ученика.
// Пустое поле — undefined; не число — сохраняется как текст, и проверка корректности это покажет.
// scale: 100 — значение-доля показывается в процентах.
export function Num({ label, path, hint, value, onChange, placeholder, scale = 1, suffix, className }) {
  const shown = typeof value === 'number' && scale !== 1 ? Math.round(value * scale * 1000) / 1000 : value
  const [text, setText, commit] = useDraftText(shown, fmtNum)
  const change = (t) => {
    setText(t)
    const n = t.trim() === '' ? undefined : parseNumber(t)
    const next = n === null ? t : n
    commit(next)
    onChange(typeof next === 'number' && scale !== 1 ? next / scale : next)
  }
  return (
    <Field label={label} path={path} hint={hint} className={className}>
      <span className="adm-num">
        <input className="adm-input" aria-label={label} inputMode="decimal" value={text} placeholder={placeholder} onChange={(e) => change(e.target.value)} />
        {suffix && <span className="adm-num__suffix">{suffix}</span>}
      </span>
    </Field>
  )
}

const fmtLines = (v) => (v ?? []).join('\n')

// Список строк: каждая строка поля — отдельный пункт
export function Lines({ label, path, hint, value, onChange, placeholder, rows = 3 }) {
  const [text, setText, commit] = useDraftText(value, fmtLines)
  const change = (t) => {
    setText(t)
    const lines = t.split('\n').map((s) => s.trim()).filter(Boolean)
    commit(lines)
    onChange(lines)
  }
  return (
    <Field label={label} path={path} hint={hint}>
      <textarea className="adm-input" aria-label={label} rows={rows} value={text} placeholder={placeholder} onChange={(e) => change(e.target.value)} />
    </Field>
  )
}

export function Check({ label, checked, onChange, hint }) {
  return (
    <label className="adm-check">
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="adm-hint">{hint}</span>}
      </span>
    </label>
  )
}

export function Select({ label, path, hint, value, onChange, options, className }) {
  return (
    <Field label={label} path={path} hint={hint} className={className}>
      <select className="adm-input" aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, title]) => (
          <option key={v} value={v}>
            {title}
          </option>
        ))}
      </select>
    </Field>
  )
}

// Кнопки «выше / ниже / удалить» у пункта списка
export function RowTools({ onUp, onDown, onDelete, what }) {
  return (
    <span className="adm-tools">
      {onUp && (
        <button type="button" className="adm-icon" title="Выше" aria-label={`${what}: выше`} onClick={onUp}>
          ↑
        </button>
      )}
      {onDown && (
        <button type="button" className="adm-icon" title="Ниже" aria-label={`${what}: ниже`} onClick={onDown}>
          ↓
        </button>
      )}
      {onDelete && (
        <button type="button" className="adm-icon adm-icon--danger" title="Удалить" aria-label={`${what}: удалить`} onClick={onDelete}>
          ×
        </button>
      )}
    </span>
  )
}

// Текст с разметкой: формулы, жирный, картинки. Картинку можно выбрать из картинок курса,
// загрузить с компьютера или вставить из буфера обмена (Ctrl+V со снимком экрана).
// compact — короткое поле (вариант ответа, подсказка): кнопки стоят справа от него.
export function Rich({ label, path, hint, value, onChange, rows = 3, placeholder, compact = false }) {
  const { courseImages, addImage } = useAdmin()
  const nameHint = useContext(ImageHint)
  const [over, setOver] = useState(false)
  const area = useRef(null)
  const file = useRef(null)
  const [menu, setMenu] = useState(false)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const text = value ?? ''

  const insert = (markup) => {
    const el = area.current
    const at = el ? el.selectionStart : text.length
    const before = text.slice(0, at)
    const after = text.slice(el ? el.selectionEnd : at)
    // Картинка — отдельный блок: отделяем её пустыми строками от текста вокруг
    const pad = (s, edge) => (s.trim() === '' ? '' : edge)
    onChange(`${before.replace(/\s*$/, '')}${pad(before, '\n\n')}${markup}${pad(after, '\n\n')}${after.replace(/^\s*/, '')}`)
    setMenu(false)
  }

  const upload = async (files) => {
    const list = [files].flat().filter(Boolean)
    if (!list.length) return
    setError('')
    setBusy(true)
    try {
      const marks = []
      for (const f of list) {
        const named = nameHint && NAMELESS.test(f.name || 'image') ? new File([f], nameHint, { type: f.type }) : f
        marks.push(imageMarkup(await addImage(named)))
      }
      insert(marks.join('\n\n'))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Ctrl+V со снимком экрана или скопированной картинкой
  const onPaste = (e) => {
    const images = imageFiles(e.clipboardData)
    if (!images.length) return
    e.preventDefault()
    upload(images)
  }

  // Файл с компьютера можно просто бросить на поле
  const dragProps = {
    onDragOver: (e) => {
      if (![...e.dataTransfer.types].includes('Files')) return
      e.preventDefault()
      setOver(true)
    },
    onDragLeave: () => setOver(false),
    onDrop: (e) => {
      setOver(false)
      const images = imageFiles(e.dataTransfer)
      if (!images.length) return
      e.preventDefault()
      upload(images)
    },
  }

  return (
    <Field label={label} path={path} hint={hint}>
      <div className={compact ? 'adm-rich adm-rich--compact' : 'adm-rich'}>
        <textarea ref={area} className={`adm-input ${over ? 'is-over' : ''}`} aria-label={label} rows={rows} value={text} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onPaste={onPaste} {...dragProps} />
        <div className="adm-rich__bar">
          <button type="button" className="adm-link" aria-label={`${label}: вставить картинку`} onClick={() => setMenu((v) => !v)} disabled={busy}>
            {busy ? 'Загружаем…' : '＋ Картинка'}
          </button>
          <button type="button" className="adm-link" aria-label={`${label}: показать, как это выглядит`} onClick={() => setPreview((v) => !v)}>
            {preview ? 'Скрыть вид' : compact ? 'Вид' : 'Как это выглядит'}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files[0]).then(() => (e.target.value = ''))} />
        </div>
      </div>
      {menu && (
        <div className="adm-pick">
          {courseImages.map((img) => (
            <button type="button" key={img.name} title={img.name} onClick={() => insert(imageMarkup(img.name))}>
              <img src={img.url} alt="" />
              <span>{img.name}</span>
            </button>
          ))}
          <button type="button" className="adm-pick__new" onClick={() => file.current.click()}>
            Загрузить с компьютера…
          </button>
        </div>
      )}
      {error && <div className="adm-issue adm-issue--error">{error}</div>}
      {preview && (text.trim() ? <MathText text={text} className="adm-rich__preview" /> : <div className="adm-rich__preview adm-hint">Пусто</div>)}
    </Field>
  )
}
