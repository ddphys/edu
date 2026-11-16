import { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { fmtBytes } from '../images.js'

// Фото своего решения к задаче. Доступно, если у задачи включено «можно приложить решение»
// и это разрешено ученику (позже — по тарифу). На XP не влияет.
export default function Attach({ courseId, taskId }) {
  const { api } = useStore()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  async function add(e) {
    const files = [...e.target.files]
    e.target.value = ''
    setError('')
    setBusy(true)
    try {
      for (const file of files) setItems(await api.addAttachment(courseId, taskId, file))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    setError('')
    setItems(await api.removeAttachment(courseId, taskId, id))
  }

  return (
    <div className="attach">
      <div className="attach__title">Своё решение</div>
      <p className="attach__note">
        Сфотографируйте решение из тетради и приложите его к задаче. Пока фото хранится только на этом
        устройстве — проверка решений появится позже.
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
        <input type="file" accept="image/*" multiple onChange={add} disabled={busy} />
        {busy ? 'Загружаем…' : items.length ? 'Добавить ещё фото' : 'Приложить фото решения'}
      </label>
    </div>
  )
}
