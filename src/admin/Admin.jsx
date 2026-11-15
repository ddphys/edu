import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { ToastProvider } from './ui.jsx'
import Builder from './Builder.jsx'
import TaskBankPage from './TaskBankPage.jsx'
import Users from './Users.jsx'
import Matrix from './Matrix.jsx'
import Invites from './Invites.jsx'
import Stats from './Stats.jsx'
import './admin.css'

const TABS = [
  ['builder', 'Конструктор курсов'],
  ['tasks', 'Банк задач'],
  ['users', 'Ученики'],
  ['matrix', 'Сводная по курсу'],
  ['invites', 'Приглашения'],
  ['stats', 'Статистика'],
]

export default function Admin() {
  const { user, logout } = useAuth()
  return (
    <ToastProvider>
      <div className="adm">
        <header className="adm__top">
          <b className="adm__logo">edu · кабинет</b>
          <nav className="adm__tabs">
            {TABS.map(([k, t]) => (
              <NavLink key={k} to={`/admin/${k}`} className={({ isActive }) => (isActive ? 'is-active' : '')}>
                {t}
              </NavLink>
            ))}
          </nav>
          <span className="adm__user">
            <a href="/" target="_blank" rel="noreferrer">
              Сайт ученика ↗
            </a>
            <span>
              {user.firstName} {user.lastName}
            </span>
            <button className="b" onClick={logout}>
              Выйти
            </button>
          </span>
        </header>
        <div className="adm__main">
          <Routes>
            <Route index element={<Navigate to="builder" replace />} />
            <Route path="builder" element={<Builder />} />
            <Route path="builder/:courseId" element={<Builder />} />
            <Route path="builder/:courseId/:lessonId" element={<Builder />} />
            <Route path="tasks" element={<TaskBankPage />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:userId" element={<Users />} />
            <Route path="matrix" element={<Matrix />} />
            <Route path="matrix/:courseId" element={<Matrix />} />
            <Route path="invites" element={<Invites />} />
            <Route path="stats" element={<Stats />} />
          </Routes>
        </div>
      </div>
    </ToastProvider>
  )
}
