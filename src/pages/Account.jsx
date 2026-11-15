import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import UserBar from '../components/UserBar.jsx'

export default function Account() {
  const { user } = useAuth()
  const [form, setForm] = useState({ oldPassword: '', newPassword: '' })
  const [msg, setMsg] = useState(null)

  async function submit(e) {
    e.preventDefault()
    try {
      await api.post('/api/auth/password', form)
      setMsg({ ok: true, text: 'Пароль изменён' })
      setForm({ oldPassword: '', newPassword: '' })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
  }

  return (
    <div className="page">
      <UserBar />
      <div className="card account">
        <h1 className="home__title">
          {user.firstName} {user.lastName}
        </h1>
        <p className="muted">{user.email}</p>
        <form onSubmit={submit} className="auth__form">
          <h3 className="section-title">Сменить пароль</h3>
          <label>
            Текущий пароль
            <input type="password" required autoComplete="current-password" value={form.oldPassword} onChange={(e) => setForm({ ...form, oldPassword: e.target.value })} />
          </label>
          <label>
            Новый пароль
            <input type="password" required minLength={8} autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
          </label>
          {msg && <div className={msg.ok ? 'ok-msg' : 'msg'}>{msg.text}</div>}
          <button className="btn btn--primary">Сохранить</button>
        </form>
      </div>
    </div>
  )
}
