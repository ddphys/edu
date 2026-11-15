import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { Login, Register } from './pages/Auth.jsx'
import Home from './pages/Home.jsx'
import Course from './pages/Course.jsx'
import Account from './pages/Account.jsx'

// Админка грузится отдельным файлом — ученикам её код не нужен
const Admin = lazy(() => import('./admin/Admin.jsx'))

function RequireUser({ children, staff = false }) {
  const { user, isStaff } = useAuth()
  const loc = useLocation()
  if (user === undefined) return <div className="page muted">Загрузка…</div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (staff && !isStaff) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { error } = useAuth()
  return (
    <>
      {error && <div className="net-error">{error}</div>}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/invite/:code" element={<Register />} />
        <Route path="/" element={<RequireUser><Home /></RequireUser>} />
        <Route path="/account" element={<RequireUser><Account /></RequireUser>} />
        <Route path="/course/:courseId" element={<RequireUser><Course /></RequireUser>} />
        <Route path="/course/:courseId/lesson/:lessonId" element={<RequireUser><Course /></RequireUser>} />
        <Route
          path="/admin/*"
          element={
            <RequireUser staff>
              <Suspense fallback={<div className="page muted">Загрузка…</div>}>
                <Admin />
              </Suspense>
            </RequireUser>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
