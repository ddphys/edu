import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { EditCell, fmtDate, useAction, useLoad, useToast } from './ui.jsx'

import { inviteLink as linkOf } from './CourseAccess.jsx'

export default function Invites() {
  const act = useAction()
  const toast = useToast()
  const { data, reload } = useLoad('/api/admin/invites')
  const { data: tree } = useLoad('/api/admin/courses')
  const courses = tree?.courses || []
  const [f, setF] = useState({ label: '', note: '', courseIds: [], maxUses: '', expiresAt: '' })

  async function create(e) {
    e.preventDefault()
    const r = await act(
      () => api.post('/api/admin/invites', { ...f, maxUses: f.maxUses || null, expiresAt: f.expiresAt || null }),
      'Приглашение создано',
    )
    if (r) {
      setF({ label: '', note: '', courseIds: [], maxUses: '', expiresAt: '' })
      reload()
      copy(r.invite.code)
    }
  }
  const patch = async (id, body) => {
    if (await act(() => api.patch(`/api/admin/invites/${id}`, body), 'Сохранено')) reload()
  }
  function copy(code) {
    navigator.clipboard?.writeText(linkOf(code)).then(
      () => toast('Ссылка скопирована'),
      () => prompt('Скопируйте ссылку:', linkOf(code)),
    )
  }
  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  return (
    <div className="pad">
      <form className="toolbar toolbar--form" onSubmit={create}>
        <b>Новая ссылка:</b>
        <input required placeholder="Метка, например «10А школа 57» или «Реклама VK, ноябрь»" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} style={{ width: 320 }} />
        <input placeholder="Заметка для себя" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ width: 220 }} />
        <span>Записать на:</span>
        {courses.map((c) => (
          <label key={c.id} className="chk">
            <input type="checkbox" checked={f.courseIds.includes(c.id)} onChange={() => setF({ ...f, courseIds: toggle(f.courseIds, c.id) })} /> {c.title}
          </label>
        ))}
        <input type="number" min="1" placeholder="Лимит регистраций" value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} style={{ width: 150 }} />
        <label>
          до <input type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
        </label>
        <button className="b b--primary">Создать и скопировать ссылку</button>
      </form>
      <p className="muted small">
        Ссылка работает и для новых учеников (регистрация), и для уже зарегистрированных (после входа им сразу открываются курсы из ссылки).
        Каждый, кто воспользовался ссылкой, получает её метку и заметку — они видны в таблице учеников, в карточке и в сводной.
        Ссылки на конкретный курс удобно создавать прямо в конструкторе, в настройках курса.
      </p>
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr>
              <th>#</th>
              <th>Метка</th>
              <th>Заметка</th>
              <th>Ссылка</th>
              <th>Курсы</th>
              <th title="Сколько человек воспользовались ссылкой (новые и уже зарегистрированные)">Воспользовались</th>
              <th>Лимит</th>
              <th>Действует до</th>
              <th>Создана</th>
              <th>Активна</th>
            </tr>
          </thead>
          <tbody>
            {data?.invites.map((i) => (
              <tr key={i.id} className={i.disabled ? 'is-blocked' : ''}>
                <td className="num">{i.id}</td>
                <td className="cell-edit">
                  <EditCell value={i.label} onSave={(v) => patch(i.id, { label: v })} />
                </td>
                <td className="cell-edit">
                  <EditCell value={i.note} placeholder="добавить…" onSave={(v) => patch(i.id, { note: v })} />
                </td>
                <td className="nowrap">
                  <code className="small">/invite/{i.code}</code>{' '}
                  <button className="b b--xs" onClick={() => copy(i.code)}>
                    копировать
                  </button>
                </td>
                <td>
                  {courses.map((c) => (
                    <label key={c.id} className="chk small" title={c.title}>
                      <input type="checkbox" checked={i.courseIds.includes(c.id)} onChange={() => patch(i.id, { courseIds: toggle(i.courseIds, c.id) })} />{' '}
                      {c.title.slice(0, 24)}
                    </label>
                  ))}
                </td>
                <td className="num">
                  <Link to={`/admin/users?label=${encodeURIComponent(i.label)}`}>{i.users}</Link>
                </td>
                <td className="cell-edit num">
                  <EditCell value={i.maxUses ? String(i.maxUses) : ''} placeholder="∞" onSave={(v) => patch(i.id, { maxUses: v || null })} />
                </td>
                <td className="nowrap">{i.expiresAt ? fmtDate(i.expiresAt) : '—'}</td>
                <td className="nowrap">{fmtDate(i.createdAt)}</td>
                <td>
                  <input type="checkbox" checked={!i.disabled} onChange={(e) => patch(i.id, { disabled: !e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
