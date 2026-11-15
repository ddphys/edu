import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api.js'
import UserBar from '../components/UserBar.jsx'

export default function Home() {
  const [courses, setCourses] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/courses').then((r) => setCourses(r.courses)).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="page msg">{error}</div>
  if (!courses) return <div className="page muted">Загрузка…</div>
  if (courses.length === 1) return <Navigate to={`/course/${courses[0].id}`} replace />

  return (
    <div className="page">
      <UserBar />
      <h1 className="home__title">Мои курсы</h1>
      {courses.length === 0 && <div className="card muted">Пока нет доступных курсов</div>}
      <div className="home__grid">
        {courses.map((c) => (
          <Link key={c.id} to={`/course/${c.id}`} className="card home__course">
            <div className="muted">{c.enrolled ? 'Вы записаны' : 'Доступны бесплатные занятия'}</div>
            <h2>{c.title}</h2>
          </Link>
        ))}
      </div>
    </div>
  )
}
