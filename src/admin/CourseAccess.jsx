import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { EditCell, fmtDate, useAction, useLoad, useToast } from './ui.jsx'

export const inviteLink = (code) => `${location.origin}/invite/${code}`

// Доступ к курсу: кто записан (с ручным добавлением) и ссылки-приглашения на этот курс
export default function CourseAccess({ course }) {
  const act = useAction()
  const toast = useToast()
  const students = useLoad(`/api/admin/courses/${course.id}/students`)
  const users = useLoad('/api/admin/users')
  const invites = useLoad('/api/admin/invites')
  const [pick, setPick] = useState('')
  const [inv, setInv] = useState({ label: '', note: '' })

  const enrolled = useMemo(() => new Set(students.data?.students.map((s) => s.id)), [students.data])
  const candidates = (users.data?.users || []).filter((u) => u.role === 'student' && !enrolled.has(u.id))
  const courseInvites = (invites.data?.invites || []).filter((i) => i.courseIds.includes(course.id))

  async function add() {
    const m = pick.match(/^#(\d+)/)
    const u = m && candidates.find((x) => x.id === Number(m[1]))
    if (!u) return toast('Выберите ученика из списка подсказок', 'err')
    if (await act(() => api.post(`/api/admin/courses/${course.id}/students`, { userIds: [u.id] }), 'Доступ открыт')) {
      setPick('')
      students.reload()
    }
  }
  async function remove(s) {
    if (!confirm(`Закрыть доступ к курсу для ${s.name}? Прогресс сохранится.`)) return
    if (await act(() => api.del(`/api/admin/courses/${course.id}/students/${s.id}`), 'Доступ закрыт')) students.reload()
  }
  function copy(code) {
    navigator.clipboard?.writeText(inviteLink(code)).then(
      () => toast('Ссылка скопирована'),
      () => prompt('Скопируйте ссылку:', inviteLink(code)),
    )
  }
  async function createInvite(e) {
    e.preventDefault()
    const r = await act(() => api.post('/api/admin/invites', { ...inv, courseIds: [course.id] }), 'Ссылка создана')
    if (r) {
      setInv({ label: '', note: '' })
      invites.reload()
      copy(r.invite.code)
    }
  }
  const patchInvite = async (id, body) => {
    if (await act(() => api.patch(`/api/admin/invites/${id}`, body), 'Сохранено')) invites.reload()
  }

  return (
    <div className="access">
      <div>
        <div className="panel-title">
          Ученики с доступом ({students.data?.students.length ?? '…'})
          <span className="muted">бесплатные уроки видны всем, платные — только им</span>
        </div>
        <div className="toolbar">
          <input list={`cand-${course.id}`} placeholder="Начните вводить имя или email" value={pick} onChange={(e) => setPick(e.target.value)} style={{ width: 320 }} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <datalist id={`cand-${course.id}`}>
            {candidates.map((u) => (
              <option key={u.id} value={`#${u.id} ${u.lastName} ${u.firstName} <${u.email}>`} />
            ))}
          </datalist>
          <button className="b b--primary" onClick={add}>
            Дать доступ
          </button>
        </div>
        <div className="tablewrap tablewrap--short">
          <table className="t">
            <thead>
              <tr>
                <th>#</th>
                <th>Ученик</th>
                <th>Email</th>
                <th>С какого числа</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {students.data?.students.map((s) => (
                <tr key={s.id}>
                  <td className="num">{s.id}</td>
                  <td>
                    <Link to={`/admin/users/${s.id}`}>{s.name}</Link>
                  </td>
                  <td className="mono">{s.email}</td>
                  <td>{fmtDate(s.enrolledAt)}</td>
                  <td>
                    <button className="b b--xs b--danger" onClick={() => remove(s)} title="Закрыть доступ">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="panel-title">
          Ссылки-приглашения на этот курс
          <span className="muted">работают и для новых, и для уже зарегистрированных</span>
        </div>
        <form className="toolbar" onSubmit={createInvite}>
          <input required placeholder="Метка: «10А школа 57»" value={inv.label} onChange={(e) => setInv({ ...inv, label: e.target.value })} style={{ width: 200 }} />
          <input placeholder="Заметка: откуда, кто, когда…" value={inv.note} onChange={(e) => setInv({ ...inv, note: e.target.value })} style={{ width: 240 }} />
          <button className="b b--primary">Создать и скопировать</button>
        </form>
        <div className="tablewrap tablewrap--short">
          <table className="t">
            <thead>
              <tr>
                <th>Метка</th>
                <th>Заметка</th>
                <th title="Сколько человек воспользовались">Чел.</th>
                <th>Ссылка</th>
                <th>Активна</th>
              </tr>
            </thead>
            <tbody>
              {courseInvites.map((i) => (
                <tr key={i.id} className={i.disabled ? 'is-blocked' : ''}>
                  <td className="cell-edit">
                    <EditCell value={i.label} onSave={(v) => patchInvite(i.id, { label: v })} />
                  </td>
                  <td className="cell-edit">
                    <EditCell value={i.note} multiline placeholder="добавить…" onSave={(v) => patchInvite(i.id, { note: v })} />
                  </td>
                  <td className="num">
                    <Link to={`/admin/users?label=${encodeURIComponent(i.label)}`}>{i.users}</Link>
                  </td>
                  <td className="nowrap">
                    <button className="b b--xs" onClick={() => copy(i.code)}>
                      копировать
                    </button>
                  </td>
                  <td>
                    <input type="checkbox" checked={!i.disabled} onChange={(e) => patchInvite(i.id, { disabled: !e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
