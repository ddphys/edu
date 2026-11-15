import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'

function AuthCard({ title, children }) {
  return (
    <div className="auth">
      <div className="card auth__card">
        <h1 className="auth__title">{title}</h1>
        {children}
      </div>
    </div>
  )
}

export function Login() {
  const { user, setUser } = useAuth()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = params.get('next') || '/'

  if (user) return <Navigate to={next} replace />

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api.post('/api/auth/login', form)
      setUser(r.user)
      nav(next, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Вход">
      <form onSubmit={submit} className="auth__form">
        <label>
          Email
          <input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          Пароль
          <input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        {error && <div className="msg">{error}</div>}
        <button className="btn btn--primary" disabled={busy}>Войти</button>
      </form>
      <p className="muted auth__alt">
        Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        <br />
        Забыли пароль? Напишите преподавателю — он задаст новый.
      </p>
    </AuthCard>
  )
}

export function Register() {
  const { user, setUser } = useAuth()
  const { code } = useParams()
  const nav = useNavigate()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [invite, setInvite] = useState(code ? 'checking' : null)
  const [open, setOpen] = useState(true)

  const [courses, setCourses] = useState([])

  useEffect(() => {
    if (code)
      api
        .get(`/api/auth/invite/${encodeURIComponent(code)}`)
        .then((r) => {
          setInvite(r.valid ? 'ok' : 'bad')
          setCourses(r.courses || [])
        })
        .catch(() => setInvite('bad'))
    else api.get('/api/auth/config').then((r) => setOpen(r.openRegistration)).catch(() => {})
  }, [code, user])

  if (user && code) return <AcceptInvite code={code} />
  if (user) return <Navigate to="/" replace />

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api.post('/api/auth/register', { ...form, invite: code })
      setUser(r.user)
      nav('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  if (invite === 'bad')
    return (
      <AuthCard title="Ссылка недействительна">
        <p>Срок действия приглашения истёк или его отключили. Попросите у преподавателя новую ссылку.</p>
        <Link to="/login">Ко входу</Link>
      </AuthCard>
    )
  if (!code && !open)
    return (
      <AuthCard title="Регистрация по приглашению">
        <p>Зарегистрироваться можно только по ссылке-приглашению от преподавателя.</p>
        <Link to="/login">Ко входу</Link>
      </AuthCard>
    )

  return (
    <AuthCard title="Регистрация">
      {code && courses.length > 0 && (
        <p className="auth__invite">
          Приглашение на курс: <b>{courses.map((c) => c.title).join(', ')}</b>
        </p>
      )}
      <form onSubmit={submit} className="auth__form">
        <div className="auth__row">
          <label>
            Имя
            <input required autoComplete="given-name" value={form.firstName} onChange={set('firstName')} />
          </label>
          <label>
            Фамилия
            <input required autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
          </label>
        </div>
        <label>
          Email
          <input type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
          <small className="muted">Проверьте, что email написан без ошибок — по нему вы будете входить</small>
        </label>
        <label>
          Пароль
          <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
          <small className="muted">Не короче 8 символов</small>
        </label>
        {error && <div className="msg">{error}</div>}
        <button className="btn btn--primary" disabled={busy || invite === 'checking'}>Зарегистрироваться</button>
      </form>
      <p className="muted auth__alt">
        Уже есть аккаунт? <Link to={code ? `/login?next=${encodeURIComponent(`/invite/${code}`)}` : '/login'}>Войти</Link>
        {code && <> — после входа доступ к курсу откроется автоматически</>}
      </p>
    </AuthCard>
  )
}

// Уже вошедший пользователь открыл ссылку-приглашение: открываем ему курсы из ссылки
function AcceptInvite({ code }) {
  const [state, setState] = useState({ status: 'busy' })
  useEffect(() => {
    api
      .post(`/api/auth/invite/${encodeURIComponent(code)}/accept`)
      .then((r) => setState({ status: 'ok', courses: r.courses }))
      .catch((e) => setState({ status: 'err', error: e.message }))
  }, [code])

  if (state.status === 'busy') return <AuthCard title="Приглашение">Открываем доступ…</AuthCard>
  if (state.status === 'err')
    return (
      <AuthCard title="Ссылка недействительна">
        <p>{state.error}. Попросите у преподавателя новую ссылку.</p>
        <Link to="/">К моим курсам</Link>
      </AuthCard>
    )
  if (state.courses.length === 1) return <Navigate to={`/course/${state.courses[0].id}`} replace />
  return (
    <AuthCard title="Доступ открыт">
      {state.courses.length === 0 ? (
        <p>Приглашение принято.</p>
      ) : (
        <ul>
          {state.courses.map((c) => (
            <li key={c.id}>
              <Link to={`/course/${c.id}`}>{c.title}</Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/">К моим курсам</Link>
    </AuthCard>
  )
}
