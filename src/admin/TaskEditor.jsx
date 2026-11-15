import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import MathText from '../components/Math.jsx'
import { Drawer, fmtDateTime, insertAtCursor, useAction, useLatest, useLoad } from './ui.jsx'

const EMPTY = {
  title: '',
  code: '',
  text: '',
  parts: [{ label: '', answer: '', tolerance: '' }],
  hints: [],
  solution: '',
  xp: '',
  topic: '',
  tags: [],
  difficulty: '',
  source: '',
  note: '',
}

const toForm = (t) => ({
  ...EMPTY,
  ...t,
  code: t.code ?? '',
  xp: t.xp ?? '',
  difficulty: t.difficulty ?? '',
  parts: t.parts.map((p) => ({ label: p.label, answer: String(p.answer).replace('.', ','), tolerance: p.tolerance ? String(p.tolerance).replace('.', ',') : '' })),
})

// Поле с формулами: вставка картинки из буфера (Ctrl+V) или перетаскиванием файла
function MathArea({ value, onChange, rows = 6, onFocusEl, placeholder }) {
  const ref = useRef(null)
  const act = useAction()
  async function uploadFiles(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue
      const r = await act(() => api.upload('/api/admin/uploads', f))
      if (r) insertAtCursor(ref.current, `\n![](${r.url})\n`, onChange)
    }
  }
  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      onFocus={() => onFocusEl?.(ref.current, onChange)}
      onChange={(e) => onChange(e.target.value)}
      onPaste={(e) => {
        const files = [...e.clipboardData.files]
        if (files.length) {
          e.preventDefault()
          uploadFiles(files)
        }
      }}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault()
          uploadFiles([...e.dataTransfer.files])
        }
      }}
    />
  )
}

export default function TaskEditor({ taskId, onClose, onSaved, initial }) {
  const isNew = !taskId
  const { data } = useLoad(isNew ? null : `/api/admin/tasks/${taskId}`)
  const { data: meta } = useLoad('/api/admin/tasks/meta')
  const [form, setForm] = useState(isNew ? { ...EMPTY, ...initial } : null)
  const [dirty, setDirty] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const focused = useRef(null) // последнее поле, куда вставлять картинку
  const fileRef = useRef(null)
  const act = useAction()

  useEffect(() => {
    if (data?.task) setForm(toForm(data.task))
  }, [data])

  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
  }
  const setPart = (i, k, v) => set('parts')(form.parts.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
  const setHint = (i, v) => set('hints')(form.hints.map((h, j) => (j === i ? v : h)))
  const move = (arr, i, d) => {
    const a = [...arr]
    ;[a[i], a[i + d]] = [a[i + d], a[i]]
    return a
  }
  const onFocusEl = (el, setter) => (focused.current = { el, setter })

  async function save(close = false) {
    const body = {
      ...form,
      tags: tagInput.trim() ? [...form.tags, tagInput.trim()] : form.tags,
      xp: form.xp === '' ? null : Number(form.xp),
      difficulty: form.difficulty === '' ? null : Number(form.difficulty),
    }
    delete body.id
    delete body.lessons
    delete body.stats
    delete body.createdAt
    delete body.updatedAt
    delete body.archived
    const r = await act(() => (isNew ? api.post('/api/admin/tasks', body) : api.patch(`/api/admin/tasks/${taskId}`, body)), 'Задача сохранена')
    if (!r) return
    setDirty(false)
    setTagInput('')
    setForm(toForm(r.task))
    onSaved?.(r.task, isNew)
    if (close) onClose()
  }
  const saveRef = useLatest(save)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveRef])

  async function uploadButton(files) {
    for (const f of files) {
      const r = await act(() => api.upload('/api/admin/uploads', f))
      if (!r) continue
      const md = `\n![](${r.url})\n`
      if (focused.current) insertAtCursor(focused.current.el, md, focused.current.setter)
      else set('text')(form.text + md)
    }
  }

  const close = () => {
    if (dirty && !confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return
    onClose()
  }

  const task = data?.task
  return (
    <Drawer
      title={isNew ? 'Новая задача' : `Задача #${taskId}${dirty ? ' • не сохранено' : ''}`}
      onClose={close}
      width={1400}
      actions={
        <>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => uploadButton([...e.target.files]) && (e.target.value = '')} />
          <button className="b" onClick={() => fileRef.current.click()} title="Вставить картинку в поле, где стоит курсор. Можно также вставить из буфера Ctrl+V или перетащить файл в поле">
            🖼 Картинка
          </button>
          <button className="b b--primary" onClick={() => save(false)} title="Ctrl+S">
            Сохранить
          </button>
          <button className="b" onClick={() => save(true)}>
            Сохранить и закрыть
          </button>
        </>
      }
    >
      {!form ? (
        <div className="muted">Загрузка…</div>
      ) : (
        <div className="te">
          <div className="te__form">
            <div className="grid-form">
              <label className="span2">
                Название
                <input value={form.title} onChange={(e) => set('title')(e.target.value)} autoFocus={isNew} />
              </label>
              <label>
                Код
                <input value={form.code} onChange={(e) => set('code')(e.target.value)} placeholder="необязательно" />
              </label>
              <label>
                Тема
                <input list="te-topics" value={form.topic} onChange={(e) => set('topic')(e.target.value)} />
                <datalist id="te-topics">{meta?.topics.map((t) => <option key={t.topic} value={t.topic} />)}</datalist>
              </label>
              <label>
                Сложность
                <select value={form.difficulty} onChange={(e) => set('difficulty')(e.target.value)}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                XP (пусто = по курсу)
                <input type="number" min="1" value={form.xp} onChange={(e) => set('xp')(e.target.value)} />
              </label>
              <label className="span2">
                Теги
                <div className="tags-input">
                  {form.tags.map((t) => (
                    <span key={t} className="pill">
                      {t}
                      <button onClick={() => set('tags')(form.tags.filter((x) => x !== t))}>×</button>
                    </span>
                  ))}
                  <input
                    list="te-tags"
                    value={tagInput}
                    placeholder="тег + Enter"
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                        e.preventDefault()
                        if (!form.tags.includes(tagInput.trim())) set('tags')([...form.tags, tagInput.trim()])
                        setTagInput('')
                      }
                    }}
                  />
                  <datalist id="te-tags">{meta?.tags.map((t) => <option key={t.tag} value={t.tag} />)}</datalist>
                </div>
              </label>
              <label className="span2">
                Источник
                <input value={form.source} onChange={(e) => set('source')(e.target.value)} placeholder="олимпиада, год, сборник…" />
              </label>
            </div>

            <div className="te__label">
              Условие <span className="muted">— формулы $…$ и $$…$$, **жирный**, картинка: Ctrl+V / перетащить файл</span>
            </div>
            <MathArea value={form.text} onChange={set('text')} rows={8} onFocusEl={onFocusEl} />

            <div className="te__label">
              Поля ответа{' '}
              <span className="muted">— число; дробная часть через запятую или точку; погрешность — допустимое отклонение (±)</span>
            </div>
            <table className="t t--form">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Подпись (если полей несколько)</th>
                  <th style={{ width: 120 }}>Ответ</th>
                  <th style={{ width: 100 }}>± погрешн.</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {form.parts.map((p, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <input value={p.label} onChange={(e) => setPart(i, 'label', e.target.value)} placeholder="напр. Время полёта $t$, с" />
                    </td>
                    <td>
                      <input value={p.answer} onChange={(e) => setPart(i, 'answer', e.target.value)} inputMode="decimal" />
                    </td>
                    <td>
                      <input value={p.tolerance} onChange={(e) => setPart(i, 'tolerance', e.target.value)} inputMode="decimal" placeholder="0" />
                    </td>
                    <td className="nowrap">
                      <button className="b b--xs" disabled={i === 0} onClick={() => set('parts')(move(form.parts, i, -1))}>↑</button>
                      <button className="b b--xs" disabled={i === form.parts.length - 1} onClick={() => set('parts')(move(form.parts, i, 1))}>↓</button>
                      <button className="b b--xs b--danger" disabled={form.parts.length === 1} onClick={() => set('parts')(form.parts.filter((_, j) => j !== i))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="b" onClick={() => set('parts')([...form.parts, { label: '', answer: '', tolerance: '' }])}>
              + поле ответа
            </button>

            <div className="te__label">Подсказки (открываются по одной, каждая снижает XP)</div>
            {form.hints.map((h, i) => (
              <div key={i} className="te__hint">
                <div className="te__hint-bar">
                  <b>Подсказка {i + 1}</b>
                  <span>
                    <button className="b b--xs" disabled={i === 0} onClick={() => set('hints')(move(form.hints, i, -1))}>↑</button>
                    <button className="b b--xs" disabled={i === form.hints.length - 1} onClick={() => set('hints')(move(form.hints, i, 1))}>↓</button>
                    <button className="b b--xs b--danger" onClick={() => set('hints')(form.hints.filter((_, j) => j !== i))}>✕</button>
                  </span>
                </div>
                <MathArea value={h} onChange={(v) => setHint(i, v)} rows={3} onFocusEl={onFocusEl} />
              </div>
            ))}
            <button className="b" onClick={() => set('hints')([...form.hints, ''])}>
              + подсказка
            </button>

            <div className="te__label">Эталонное решение (показывается после завершения задачи)</div>
            <MathArea value={form.solution} onChange={set('solution')} rows={8} onFocusEl={onFocusEl} />

            <div className="te__label">Заметка для себя (ученики не видят)</div>
            <textarea rows={2} value={form.note} onChange={(e) => set('note')(e.target.value)} />

            {task && (
              <div className="muted te__meta">
                Создана {fmtDateTime(task.createdAt)} · изменена {fmtDateTime(task.updatedAt)}
                {task.lessons?.length > 0 && <> · в уроках: {task.lessons.map((l) => l.title).join(', ')}</>}
              </div>
            )}
          </div>

          <div className="te__preview">
            <div className="te__preview-title">Так увидит ученик</div>
            <div className="te__paper">
              <div className="task__head">{form.title || 'Без названия'}</div>
              <MathText text={form.text} className="task__text" />
              <div className="te__parts">
                {form.parts.map((p, i) => (
                  <div key={i} className="te__part">
                    {form.parts.length > 1 && <MathText text={p.label || `Поле ${i + 1}`} inline />}
                    <span className="te__answer">
                      ответ: <b>{p.answer || '?'}</b>
                      {p.tolerance && <> ± {p.tolerance}</>}
                    </span>
                  </div>
                ))}
              </div>
              {form.hints.map((h, i) => (
                <div className="hint" key={i}>
                  <div className="hint__title">Подсказка {i + 1}</div>
                  <MathText text={h} />
                </div>
              ))}
              {form.solution && (
                <div className="solution">
                  <div className="solution__title">Решение задачи:</div>
                  <MathText text={form.solution} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}
