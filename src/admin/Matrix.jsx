import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { STATUS_LABEL, fmtAgo, fmtDateTime, pct, useLoad, useSort } from './ui.jsx'

// Сводная таблица: строки — ученики, столбцы — задачи курса по урокам.
export default function Matrix() {
  const { courseId } = useParams()
  const nav = useNavigate()
  const { data: tree } = useLoad('/api/admin/courses')
  const { data, error } = useLoad(courseId ? `/api/admin/courses/${courseId}/matrix` : null)
  const [q, setQ] = useState('')
  const [label, setLabel] = useState('')
  const [onlyLesson, setOnlyLesson] = useState('')
  const [show, setShow] = useState('attempts') // что писать в клетке

  const courses = tree?.courses || []
  useEffect(() => {
    if (!courseId && courses.length) nav(`/admin/matrix/${courses[0].id}`, { replace: true })
  }, [courseId, courses, nav])

  const lessons = useMemo(() => (data?.lessons || []).filter((l) => !onlyLesson || String(l.id) === onlyLesson), [data, onlyLesson])
  const cols = lessons.flatMap((l) => l.tasks.map((t, i) => ({ ...t, lessonId: l.id, n: i + 1 })))
  const labels = [...new Set((data?.students || []).map((s) => s.label).filter(Boolean))].sort()
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (data?.students || []).filter(
      (st) => (!label || st.label === label) && (!s || `${st.name} ${st.email} ${st.note}`.toLowerCase().includes(s)),
    )
  }, [data, q, label])
  const { sorted, Th } = useSort(rows, ['name', 'asc'], { lastSeenAt: (s) => (s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : null) })

  const cell = (c) => {
    if (!c) return ''
    if (show === 'xp') return c.xp || (c.s === 'pending' ? '·' : '0')
    if (show === 'hints') return c.h
    return c.s === 'pending' && c.a === 0 ? '·' : c.a
  }
  const colStats = (taskId) => {
    const vals = rows.map((r) => r.cells[taskId]).filter(Boolean)
    return { started: vals.length, solved: vals.filter((v) => v.s === 'correct').length }
  }

  return (
    <div className="pad">
      <div className="toolbar">
        <select value={courseId || ''} onChange={(e) => nav(`/admin/matrix/${e.target.value}`)}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select value={onlyLesson} onChange={(e) => setOnlyLesson(e.target.value)}>
          <option value="">Все уроки</option>
          {data?.lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
        <input className="toolbar__search" placeholder="Поиск ученика" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">Все метки</option>
          {labels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <span>В клетке:</span>
        <select value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="attempts">число попыток</option>
          <option value="hints">число подсказок</option>
          <option value="xp">XP</option>
        </select>
        <span className="legend">
          <span className="mx mx--correct">верно</span>
          <span className="mx mx--wrong">неверно</span>
          <span className="mx mx--skipped">не знаю</span>
          <span className="mx mx--pending">в процессе</span>
        </span>
        <span className="muted">{sorted.length} учеников</span>
      </div>
      {error && <div className="err">{error}</div>}
      {data && (
        <div className="tablewrap tablewrap--matrix">
          <table className="t matrix">
            <thead>
              <tr>
                <th colSpan={5} className="sticky-col" />
                {lessons.map((l) => (
                  <th key={l.id} colSpan={l.tasks.length} className="matrix__lesson" title={l.title}>
                    {l.title}
                  </th>
                ))}
              </tr>
              <tr>
                <Th k="name" className="sticky-col">Ученик</Th>
                <Th k="label">Метка</Th>
                <Th k="xp">XP</Th>
                <Th k="solved">Реш.</Th>
                <Th k="lastSeenAt">Был</Th>
                {cols.map((t) => (
                  <th key={`${t.lessonId}-${t.id}`} className="matrix__task" title={`#${t.id} ${t.title}`}>
                    {t.n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id}>
                  <td className="sticky-col nowrap">
                    <Link to={`/admin/users/${s.id}`}>{s.name}</Link>
                    {!s.enrolled && <span className="badge" title="Не записан на курс, решает бесплатные уроки">без записи</span>}
                  </td>
                  <td className="ell">{s.label}</td>
                  <td className="num">{s.xp}</td>
                  <td className="num">{s.solved}</td>
                  <td className="nowrap">{fmtAgo(s.lastSeenAt)}</td>
                  {cols.map((t) => {
                    const c = s.cells[t.id]
                    return (
                      <td
                        key={`${t.lessonId}-${t.id}`}
                        className={`mx ${c ? `mx--${c.s}` : ''}`}
                        title={c ? `#${t.id} ${t.title}\n${STATUS_LABEL[c.s]} · попыток ${c.a} · подсказок ${c.h} · ${c.xp} XP\n${fmtDateTime(c.at)}` : `#${t.id} ${t.title}\nне открывал`}
                      >
                        {cell(c)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky-col">
                  <b>Решили верно</b>
                </td>
                <td colSpan={4} className="muted">
                  из начавших
                </td>
                {cols.map((t) => {
                  const st = colStats(t.id)
                  return (
                    <td key={`${t.lessonId}-${t.id}`} className="num small" title={`начали ${st.started}, решили ${st.solved}`}>
                      {st.started ? pct(st.solved, st.started) : ''}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {courseId && !data && !error && <div className="muted">Загрузка…</div>}
      {lessons.length === 0 && data && <div className="muted">В курсе пока нет задач</div>}
    </div>
  )
}
