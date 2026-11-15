import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Drawer, EditCell, ROLE_LABEL, STATUS_LABEL, fmtAgo, fmtDate, fmtDateTime, useAction, useLoad, useSort } from './ui.jsx'

export default function Users() {
  const { userId } = useParams()
  const nav = useNavigate()
  const act = useAction()
  const { data, error, reload } = useLoad('/api/admin/users')
  const { data: tree } = useLoad('/api/admin/courses')
  const [q, setQ] = useState('')
  const [params] = useSearchParams()
  const [label, setLabel] = useState(params.get('label') || '')
  const [role, setRole] = useState('student')
  const [selected, setSelected] = useState([])
  const [merging, setMerging] = useState(null)

  const courses = tree?.courses || []
  const labels = useMemo(() => [...new Set((data?.users || []).map((u) => u.invite?.label).filter(Boolean))].sort(), [data])
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (data?.users || []).filter(
      (u) =>
        (!role || u.role === role) &&
        (!label || (label === '—' ? !u.invite : u.invite?.label === label)) &&
        (!s || `${u.id} ${u.lastName} ${u.firstName} ${u.email} ${u.note} ${u.invite?.label ?? ''}`.toLowerCase().includes(s)),
    )
  }, [data, q, label, role])
  const { sorted, Th } = useSort(rows, ['createdAt', 'desc'], {
    name: (u) => `${u.lastName} ${u.firstName}`,
    label: (u) => u.invite?.label ?? '',
    lastSeenAt: (u) => (u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : null),
    lastActivityAt: (u) => (u.lastActivityAt ? new Date(u.lastActivityAt).getTime() : null),
    createdAt: (u) => new Date(u.createdAt).getTime(),
  })

  const patch = async (id, body) => {
    if (await act(() => api.patch(`/api/admin/users/${id}`, body), 'Сохранено')) reload()
  }
  const toggleSel = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)))
  const byId = (id) => data?.users.find((u) => u.id === id)

  // Похожие аккаунты: одинаковые имя+фамилия — кандидаты на объединение
  const dupNames = useMemo(() => {
    const m = {}
    for (const u of data?.users || []) {
      const k = `${u.lastName} ${u.firstName}`.toLowerCase().replace(/ё/g, 'е')
      m[k] = (m[k] || 0) + 1
    }
    return m
  }, [data])
  const isDup = (u) => dupNames[`${u.lastName} ${u.firstName}`.toLowerCase().replace(/ё/g, 'е')] > 1

  return (
    <div className="pad">
      <div className="toolbar">
        <input className="toolbar__search" placeholder="Поиск: имя, email, комментарий, метка, №" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">Все метки</option>
          <option value="—">Без приглашения</option>
          {labels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Все роли</option>
          <option value="student">Ученики</option>
          <option value="admin">Админы</option>
        </select>
        <span className="muted">{sorted.length} чел.</span>
        <span className="toolbar__sep" />
        <span className="muted">Отметьте 2 аккаунта галочками →</span>
        <button className="b b--primary" disabled={selected.length !== 2} onClick={() => setMerging(selected)}>
          Объединить аккаунты
        </button>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr>
              <th />
              <Th k="id">#</Th>
              <Th k="name">Фамилия Имя</Th>
              <Th k="email">Email</Th>
              <Th k="label">Метка (приглашение)</Th>
              <th style={{ minWidth: 220 }}>Комментарий</th>
              <th>Курсы</th>
              <Th k="xp">XP</Th>
              <Th k="solved" title="Решено верно">Реш.</Th>
              <Th k="failed" title="Не засчитано (ошибки или «не знаю»)">Не засч.</Th>
              <Th k="started" title="Начато задач">Нач.</Th>
              <Th k="attempts" title="Всего отправок ответа">Попыток</Th>
              <Th k="lastActivityAt" title="Последнее действие с задачами">Активность</Th>
              <Th k="lastSeenAt" title="Последний заход на сайт">Был</Th>
              <Th k="createdAt">Регистрация</Th>
              <Th k="role">Роль</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => (
              <tr key={u.id} className={`${u.blocked ? 'is-blocked' : ''} ${selected.includes(u.id) ? 'is-selected' : ''}`}>
                <td>
                  <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleSel(u.id)} />
                </td>
                <td className="num">{u.id}</td>
                <td className="nowrap">
                  <button className="lnk" onClick={() => nav(`/admin/users/${u.id}`)}>
                    {u.lastName} {u.firstName}
                  </button>
                  {isDup(u) && (
                    <span className="badge badge--warn" title="Есть другой аккаунт с такими же именем и фамилией">
                      дубль?
                    </span>
                  )}
                  {u.blocked && <span className="badge">заблокирован</span>}
                </td>
                <td className="mono ell">{u.email}</td>
                <td className="ell">{u.invite?.label ?? <span className="muted">—</span>}</td>
                <td className="cell-edit">
                  <EditCell value={u.note} multiline placeholder="добавить…" onSave={(v) => patch(u.id, { note: v })} />
                </td>
                <td className="ell" title={u.courseIds.map((id) => courses.find((c) => c.id === id)?.title).join('\n')}>
                  {u.role !== 'student' ? <span className="muted">все</span> : u.courseIds.length || <span className="muted">—</span>}
                </td>
                <td className="num">{u.xp}</td>
                <td className="num">{u.solved}</td>
                <td className="num">{u.failed}</td>
                <td className="num">{u.started}</td>
                <td className="num">{u.attempts}</td>
                <td className="nowrap" title={fmtDateTime(u.lastActivityAt)}>{fmtAgo(u.lastActivityAt)}</td>
                <td className="nowrap" title={fmtDateTime(u.lastSeenAt)}>{fmtAgo(u.lastSeenAt)}</td>
                <td className="nowrap">{fmtDate(u.createdAt)}</td>
                <td>{ROLE_LABEL[u.role]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {userId && (
        <UserDrawer
          key={userId}
          id={userId}
          courses={courses}
          onClose={() => nav('/admin/users')}
          onChanged={reload}
          onMerge={(other) => (byId(other) ? setMerging([Number(userId), other]) : alert(`Аккаунт #${other} не найден`))}
        />
      )}
      {merging && byId(merging[0]) && byId(merging[1]) && (
        <MergeDialog
          a={byId(merging[0])}
          b={byId(merging[1])}
          onClose={() => setMerging(null)}
          onDone={(intoId) => {
            setMerging(null)
            setSelected([])
            reload()
            nav(`/admin/users/${intoId}`)
          }}
        />
      )}
    </div>
  )
}

// ---------- Объединение ----------
function MergeDialog({ a, b, onClose, onDone }) {
  const act = useAction()
  // по умолчанию основной — более старый аккаунт
  const [into, setInto] = useState(new Date(a.createdAt) <= new Date(b.createdAt) ? a.id : b.id)
  const main = into === a.id ? a : b
  const dup = into === a.id ? b : a

  async function go() {
    if (!confirm(`Перенести всё из #${dup.id} (${dup.email}) в #${main.id} (${main.email}) и удалить #${dup.id}? Это нельзя отменить.`)) return
    const r = await act(() => api.post(`/api/admin/users/${main.id}/merge`, { fromId: dup.id }))
    if (r) {
      alert(`Готово. Перенесено задач: ${r.moved}, заменено на лучший результат: ${r.replaced}, оставлено как было: ${r.kept}.`)
      onDone(main.id)
    }
  }

  const Col = ({ u }) => (
    <label className={`merge__col ${into === u.id ? 'is-main' : ''}`}>
      <input type="radio" checked={into === u.id} onChange={() => setInto(u.id)} />
      <b>
        #{u.id} {u.lastName} {u.firstName}
      </b>
      <div className="mono">{u.email}</div>
      <div>Метка: {u.invite?.label ?? '—'}</div>
      <div>Регистрация: {fmtDateTime(u.createdAt)}</div>
      <div>Был: {fmtDateTime(u.lastSeenAt)}</div>
      <div>
        XP {u.xp} · решено {u.solved} · начато {u.started}
      </div>
      {u.note && <div className="muted">«{u.note}»</div>}
      <div className="merge__tag">{into === u.id ? 'ОСТАНЕТСЯ (основной)' : 'будет удалён'}</div>
    </label>
  )

  return (
    <Drawer title="Объединение аккаунтов" onClose={onClose} width={760}>
      <p>
        Выберите <b>основной</b> аккаунт — у него останутся email, пароль и имя. Из второго в него перенесутся решения задач, история
        попыток и записи на курсы. Если одну и ту же задачу решали в обоих аккаунтах, останется лучший результат. Второй аккаунт будет
        удалён, а пометка об объединении попадёт в комментарий.
      </p>
      <div className="merge">
        <Col u={a} />
        <Col u={b} />
      </div>
      <div className="row-actions">
        <button className="b b--primary" onClick={go}>
          Объединить: оставить #{main.id}, удалить #{dup.id}
        </button>
        <button className="b" onClick={onClose}>
          Отмена
        </button>
      </div>
    </Drawer>
  )
}

// ---------- Карточка ученика ----------
function UserDrawer({ id, courses, onClose, onChanged, onMerge }) {
  const { user: me } = useAuth()
  const act = useAction()
  const { data, reload } = useLoad(`/api/admin/users/${id}`)
  const [mergeWith, setMergeWith] = useState('')
  const u = data?.user
  const refresh = () => {
    reload()
    onChanged()
  }
  const patch = async (body) => {
    if (await act(() => api.patch(`/api/admin/users/${id}`, body), 'Сохранено')) refresh()
  }

  if (!u) return <Drawer title="Ученик" onClose={onClose}><div className="muted">Загрузка…</div></Drawer>

  async function setPassword() {
    const p = prompt('Новый пароль (не короче 8 символов). Оставьте пустым — сгенерировать случайный.')
    if (p === null) return
    const r = await act(() => api.post(`/api/admin/users/${id}/password`, p ? { password: p } : {}))
    if (r) prompt('Пароль изменён. Скопируйте и передайте ученику:', r.password)
  }
  async function toggleCourse(cid, on) {
    const ids = on ? [...u.courseIds, cid] : u.courseIds.filter((x) => x !== cid)
    if (await act(() => api.put(`/api/admin/users/${id}/enrollments`, { courseIds: ids }), 'Доступ обновлён')) refresh()
  }
  async function reset(taskId) {
    if (!confirm(taskId ? 'Сбросить прогресс по этой задаче? Ученик сможет решить её заново.' : 'Сбросить ВЕСЬ прогресс ученика?')) return
    if (await act(() => api.post(`/api/admin/users/${id}/reset`, taskId ? { taskId } : {}), 'Прогресс сброшен')) refresh()
  }
  async function remove() {
    if (!confirm(`Удалить аккаунт ${u.email} вместе со всем прогрессом? Это нельзя отменить.`)) return
    if (await act(() => api.del(`/api/admin/users/${id}`), 'Удалён')) {
      onChanged()
      onClose()
    }
  }

  return (
    <Drawer title={`#${u.id} ${u.lastName} ${u.firstName}`} onClose={onClose} width={1200}>
      <div className="ud">
        <div className="ud__side">
          <table className="t t--kv">
            <tbody>
              <tr><th>Фамилия</th><td className="cell-edit"><EditCell value={u.lastName} onSave={(v) => patch({ lastName: v })} /></td></tr>
              <tr><th>Имя</th><td className="cell-edit"><EditCell value={u.firstName} onSave={(v) => patch({ firstName: v })} /></td></tr>
              <tr><th>Email</th><td className="cell-edit mono"><EditCell value={u.email} onSave={(v) => patch({ email: v })} /></td></tr>
              <tr><th>Метка</th><td>{u.invite?.label ?? '—'}</td></tr>
              <tr><th>Комментарий</th><td className="cell-edit"><EditCell value={u.note} multiline placeholder="добавить…" onSave={(v) => patch({ note: v })} /></td></tr>
              <tr><th>Регистрация</th><td>{fmtDateTime(u.createdAt)}</td></tr>
              <tr><th>Был на сайте</th><td>{fmtDateTime(u.lastSeenAt)}</td></tr>
              <tr>
                <th>Роль</th>
                <td>
                  <select value={u.role} disabled={u.id === me.id} onChange={(e) => confirm('Изменить роль?') && patch({ role: e.target.value })}>
                    <option value="student">ученик</option>
                    <option value="admin">админ</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="panel-title">Доступ к курсам</div>
          {courses.map((c) => (
            <label key={c.id} className="chk">
              <input type="checkbox" checked={u.courseIds.includes(c.id)} onChange={(e) => toggleCourse(c.id, e.target.checked)} /> {c.title}
            </label>
          ))}
          <div className="muted small">Без записи ученику доступны только бесплатные уроки.</div>

          <div className="panel-title">Действия</div>
          <div className="row-actions">
            <button className="b" onClick={setPassword}>Задать пароль</button>
            {u.id !== me.id && (
              <button className="b" onClick={() => patch({ blocked: !u.blocked })}>{u.blocked ? 'Разблокировать' : 'Заблокировать'}</button>
            )}
            <button className="b" onClick={() => reset(null)}>Сбросить весь прогресс</button>
            {u.id !== me.id && <button className="b b--danger" onClick={remove}>Удалить</button>}
          </div>
          <div className="row-actions">
            <input placeholder="№ второго аккаунта" value={mergeWith} onChange={(e) => setMergeWith(e.target.value.replace(/\D/g, ''))} style={{ width: 150 }} />
            <button className="b" disabled={!mergeWith} onClick={() => onMerge(Number(mergeWith))}>Объединить с…</button>
          </div>
        </div>

        <div className="ud__main">
          <div className="panel-title">
            Задачи ({data.progress.length}) · XP {u.xp} · решено {u.solved}
          </div>
          <div className="tablewrap">
            <table className="t">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Задача</th>
                  <th>Уроки</th>
                  <th>Статус</th>
                  <th>Попыток</th>
                  <th>Подск.</th>
                  <th>XP</th>
                  <th>Ответы</th>
                  <th>Начал</th>
                  <th>Изменено</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.progress.map((p) => (
                  <tr key={p.taskId}>
                    <td className="num">{p.taskId}</td>
                    <td className="ell">{p.title}</td>
                    <td className="ell" title={p.lessons.join('\n')}>{p.lessons.join(', ')}</td>
                    <td><span className={`st st--${p.status}`}>{STATUS_LABEL[p.status]}</span></td>
                    <td className="num">{p.attempts}</td>
                    <td className="num">{p.hintsUsed}</td>
                    <td className="num">{p.xp}</td>
                    <td className="mono ell">{p.answers.join(' | ')}</td>
                    <td className="nowrap">{fmtDateTime(p.startedAt)}</td>
                    <td className="nowrap">{fmtDateTime(p.updatedAt)}</td>
                    <td><button className="b b--xs" onClick={() => reset(p.taskId)} title="Сбросить задачу">↺</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel-title">История действий (последние 300)</div>
          <div className="tablewrap tablewrap--short">
            <table className="t">
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Задача</th>
                  <th>Действие</th>
                  <th>Введено</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{fmtDateTime(e.at)}</td>
                    <td className="ell">#{e.taskId} {e.title}</td>
                    <td>
                      {e.kind === 'attempt' ? (
                        <span className={e.correct ? 'ok' : 'bad'}>{e.correct ? 'ответ — верно' : 'ответ — неверно'}</span>
                      ) : (
                        { hint: 'подсказка', skip: '«я не знаю»', reset: 'сброшено админом' }[e.kind]
                      )}
                    </td>
                    <td className="mono">{e.answers?.join(' | ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Drawer>
  )
}
