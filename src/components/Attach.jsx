import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import { fmtBytes } from '../images.js'

// Фото своего решения к задаче. Доступно, если у задачи включено «можно приложить решение»
// и это разрешено ученику (позже — по тарифу). На XP не влияет.
export default function Attach({ courseId, taskId }) {
  const { api } = useStore()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    let alive = true
    api
      .listAttachments(courseId, taskId)
      .then((list) => alive && setItems(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [api, courseId, taskId])

  async function addFiles(files) {
    const images = [...files].filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    setError('')
    setBusy(true)
    try {
      for (const file of images) setItems(await api.addAttachment(courseId, taskId, file))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const latest = useRef(addFiles)
  latest.current = addFiles

  // Скопированную картинку можно вставить (Ctrl+V), пока курсор стоит в этой задаче
  useEffect(() => {
    const task = box.current?.closest('.task')
    if (!task) return
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (!files.length) return
      e.preventDefault()
      latest.current(files)
    }
    task.addEventListener('paste', onPaste)
    return () => task.removeEventListener('paste', onPaste)
  }, [])

  async function remove(id) {
    setError('')
    setItems(await api.removeAttachment(courseId, taskId, id))
  }

  return (
    <div
      ref={box}
      className={`attach ${over ? 'is-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        addFiles(e.dataTransfer.files)
      }}
    >
      <div className="attach__title">Своё решение</div>
      <p className="attach__note">
        Сфотографируйте решение из тетради и приложите к задаче. Пока фото хранится только на этом устройстве.
      </p>
      {items.length > 0 && (
        <ul className="attach__list">
          {items.map((item, i) => (
            <li key={item.id}>
              <a href={item.url} target="_blank" rel="noreferrer" title={`${item.name} · ${fmtBytes(item.size)}`}>
                <img src={item.url} alt={`Фото решения ${i + 1}`} />
              </a>
              <button type="button" aria-label={`Убрать фото ${i + 1}`} onClick={() => remove(item.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="msg">{error}</div>}
      <label className={`btn btn--ghost attach__add ${busy ? 'is-busy' : ''}`}>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={(e) => {
            const files = [...e.target.files]
            e.target.value = ''
            addFiles(files)
          }}
        />
        {busy ? 'Загружаем…' : items.length ? 'Добавить ещё фото' : 'Приложить фото решения'}
      </label>
    </div>
  )
}
