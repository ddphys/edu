import { Fragment, useMemo, useState } from 'react'
import { api } from '../api.js'
import MathText from '../components/Math.jsx'
import { fmtDate, pct, useAction, useLoad, useSort } from './ui.jsx'

// Таблица банка задач.
// compact — узкая панель справа в конструкторе (с кнопкой «+ в урок» и перетаскиванием).
export default function TaskBank({ compact = false, inLesson, onAdd, onOpen, onNew, version = 0 }) {
  const [q, setQ] = useState('')
  const [topic, setTopic] = useState('')
  const [tag, setTag] = useState('')
  const [archived, setArchived] = useState(false)
  const [hideUsed, setHideUsed] = useState(false)
  const [preview, setPreview] = useState(() => new Set())
  const [selected, setSelected] = useState(() => new Set())
  const params = new URLSearchParams({ q, topic, tag, archived })
  const { data, error, reload } = useLoad(`/api/admin/tasks?${params}`, [version])
  const { data: meta } = useLoad('/api/admin/tasks/meta', [version])
  const act = useAction()

  const rows = useMemo(
    () => (data?.tasks || []).filter((t) => !(hideUsed && inLesson?.has(t.id))),
    [data, hideUsed, inLesson],
  )
  const { sorted, Th } = useSort(rows, ['id', 'desc'], {
    used: (t) => t.lessons.length,
    started: (t) => t.stats.started,
    rate: (t) => (t.stats.started ? t.stats.solved / t.stats.started : null),
    avgAttempts: (t) => t.stats.avgAttempts,
    avgHints: (t) => t.stats.avgHints,
    parts: (t) => t.parts.length,
    hints: (t) => t.hints.length,
    tags: (t) => t.tags.join(','),
  })

  const togglePreview = (id) =>
    setPreview((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleSel = (id) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  async function setArchive(ids, value) {
    for (const id of ids) await act(() => api.patch(`/api/admin/tasks/${id}`, { archived: value }))
    setSelected(new Set())
    reload()
  }
  async function duplicate(id) {
    const r = await act(() => api.post(`/api/admin/tasks/${id}/duplicate`), 'Копия создана')
    if (r) {
      reload()
      onOpen?.(r.task.id)
    }
  }
  async function remove(id) {
    if (!confirm(`Удалить задачу #${id} насовсем?`)) return
    if (await act(() => api.del(`/api/admin/tasks/${id}`), 'Удалено')) reload()
  }

  const cols = compact ? 7 : 18
  return (
    <div className={`bank ${compact ? 'bank--compact' : ''}`}>
      <div className="toolbar">
        <input className="toolbar__search" placeholder="Поиск: №, название, текст, код" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Все темы</option>
          {meta?.topics.map((t) => (
            <option key={t.topic} value={t.topic}>
              {t.topic} ({t.n})
            </option>
          ))}
        </select>
        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Все теги</option>
          {meta?.tags.map((t) => (
            <option key={t.tag} value={t.tag}>
              {t.tag} ({t.n})
            </option>
          ))}
        </select>
        {compact && inLesson && (
          <label className="chk">
            <input type="checkbox" checked={hideUsed} onChange={(e) => setHideUsed(e.target.checked)} /> скрыть уже в уроке
          </label>
        )}
        {!compact && (
          <label className="chk">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> архив
          </label>
        )}
        <span className="muted">{sorted.length} шт.</span>
        {onNew && (
          <button className="b b--primary" onClick={onNew}>
            + Новая задача
          </button>
        )}
        {!compact && selected.size > 0 && (
          <>
            <b>Выбрано: {selected.size}</b>
            <button className="b" onClick={() => setArchive([...selected], !archived)}>
              {archived ? 'Вернуть из архива' : 'В архив'}
            </button>
            <button className="b" onClick={() => setSelected(new Set())}>
              Снять выбор
            </button>
          </>
        )}
      </div>
      {error && <div className="err">{error}</div>}
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr>
              {!compact && <th />}
              <Th k="id">#</Th>
              {!compact && <Th k="code">Код</Th>}
              <Th k="title">Название</Th>
              <Th k="topic">Тема</Th>
              {!compact && <Th k="tags">Теги</Th>}
              <Th k="difficulty" title="Сложность">Сл.</Th>
              {!compact && <Th k="xp">XP</Th>}
              {!compact && <Th k="parts" title="Полей ответа">Отв.</Th>}
              {!compact && <Th k="hints" title="Подсказок">Подск.</Th>}
              <Th k="used" title="В скольких уроках">Уроки</Th>
              <Th k="started" title="Сколько учеников начинали">Нач.</Th>
              <Th k="rate" title="Доля решивших верно из начавших">Реш.%</Th>
              {!compact && <Th k="avgAttempts" title="Среднее число попыток (у завершивших)">Ср.поп.</Th>}
              {!compact && <Th k="avgHints" title="Среднее число подсказок">Ср.подск.</Th>}
              {!compact && <Th k="updatedAt">Изменена</Th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const used = inLesson?.has(t.id)
              return (
                <Fragment key={t.id}>
                  <tr
                    className={used ? 'is-used' : ''}
                    draggable={Boolean(onAdd)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-task', String(t.id))
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onDoubleClick={() => onOpen?.(t.id)}
                  >
                    {!compact && (
                      <td>
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)} />
                      </td>
                    )}
                    <td className="num">{t.id}</td>
                    {!compact && <td className="mono">{t.code}</td>}
                    <td className="t__title">
                      <button className="lnk" onClick={() => onOpen?.(t.id)} title={t.text.slice(0, 400)}>
                        {t.title}
                      </button>
                      {t.note && <span className="muted" title={t.note}> 📝</span>}
                    </td>
                    <td className="ell" title={t.topic}>{t.topic}</td>
                    {!compact && <td className="ell">{t.tags.join(', ')}</td>}
                    <td className="num">{t.difficulty ?? ''}</td>
                    {!compact && <td className="num">{t.xp ?? <span className="muted">—</span>}</td>}
                    {!compact && <td className="num">{t.parts.length}</td>}
                    {!compact && <td className="num">{t.hints.length}</td>}
                    <td className="num" title={t.lessons.map((l) => l.title).join('\n')}>
                      {t.lessons.length || ''}
                    </td>
                    <td className="num">{t.stats.started || ''}</td>
                    <td className="num">{t.stats.started ? pct(t.stats.solved, t.stats.started) : ''}</td>
                    {!compact && <td className="num">{t.stats.avgAttempts ?? ''}</td>}
                    {!compact && <td className="num">{t.stats.avgHints ?? ''}</td>}
                    {!compact && <td className="nowrap">{fmtDate(t.updatedAt)}</td>}
                    <td className="nowrap">
                      <button className="b b--xs" onClick={() => togglePreview(t.id)} title="Показать условие">
                        {preview.has(t.id) ? '▴' : '▾'}
                      </button>
                      {onAdd && (
                        <button className="b b--xs b--primary" disabled={used} onClick={() => onAdd(t.id)} title="Добавить в конец урока">
                          {used ? '✓' : '+'}
                        </button>
                      )}
                      {!compact && (
                        <>
                          <button className="b b--xs" onClick={() => duplicate(t.id)} title="Дублировать">
                            ⧉
                          </button>
                          <button className="b b--xs" onClick={() => setArchive([t.id], !t.archived)} title={t.archived ? 'Вернуть из архива' : 'В архив'}>
                            {t.archived ? '↩' : '🗄'}
                          </button>
                          <button className="b b--xs b--danger" onClick={() => remove(t.id)} title="Удалить насовсем">
                            ✕
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {preview.has(t.id) && (
                    <tr className="t__preview">
                      <td colSpan={cols}>
                        <MathText text={t.text} />
                        <div className="muted">
                          Ответ: {t.parts.map((p) => `${p.label ? p.label + ' = ' : ''}${p.answer}${p.tolerance ? ' ± ' + p.tolerance : ''}`).join('; ')} · подсказок: {t.hints.length}
                          {t.lessons.length > 0 && <> · уроки: {t.lessons.map((l) => l.title).join(', ')}</>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {data && sorted.length === 0 && (
              <tr>
                <td colSpan={cols} className="muted">
                  Ничего не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
