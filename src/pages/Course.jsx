import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import Lesson from '../components/Lesson.jsx'
import UserBar from '../components/UserBar.jsx'

export default function Course() {
  const { courseId, lessonId } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [showAbout, setShowAbout] = useState(false)

  const reload = useCallback(
    () =>
      api
        .get(`/api/courses/${courseId}`)
        .then(setData)
        .catch((e) => setError(e.message)),
    [courseId],
  )
  useEffect(() => {
    reload()
  }, [reload])

  if (error) return <div className="page msg">{error}</div>
  if (!data) return <div className="page muted">Загрузка…</div>

  const { course, lessons, totalXp } = data
  if (!lessonId && lessons.length) {
    const first = lessons.find((l) => !l.locked) || lessons[0]
    return <Navigate to={`/course/${courseId}/lesson/${first.id}`} replace />
  }
  const current = lessons.find((l) => String(l.id) === lessonId)

  return (
    <div className="page">
      <UserBar />
      <header className="card course-head">
        <div>
          <div className="muted">{course.badge}</div>
          <h1>{course.title}</h1>
          <div className="chips">
            {course.about && (
              <button className="chip" onClick={() => setShowAbout((v) => !v)}>
                О курсе
              </button>
            )}
            <span className="chip">Опыт {totalXp} XP</span>
          </div>
          {showAbout && <p className="about">{course.about}</p>}
        </div>
        {course.teacher.name && (
          <div className="teacher">
            <span>{course.teacher.name}</span>
            <div className="teacher__photo">
              {course.teacher.photo ? <img src={course.teacher.photo} alt="" /> : course.teacher.name[0]}
            </div>
          </div>
        )}
      </header>

      <div className="layout">
        <nav className="card lessons">
          {lessons.map((l, i) => (
            <button
              key={l.id}
              className={`lessons__item ${String(l.id) === lessonId ? 'is-active' : ''} ${l.locked ? 'is-locked' : ''}`}
              onClick={() => nav(`/course/${courseId}/lesson/${l.id}`)}
            >
              <span className="lessons__num">{i + 1}</span>
              <span>
                <span className="lessons__title">{l.title}</span>
                <small>
                  {l.locked ? 'Доступно после записи на курс' : `Решено задач: ${l.solved} из ${l.taskCount}`}
                </small>
                {l.free && <span className="tag">Бесплатно</span>}
                {!l.published && <span className="tag tag--draft">Черновик</span>}
              </span>
            </button>
          ))}
          {lessons.length === 0 && <div className="muted">Уроков пока нет</div>}
        </nav>
        <main>
          {current?.locked ? (
            <div className="card">
              <h2 className="lesson__title">{current.title}</h2>
              <p>Этот урок откроется после записи на курс. Напишите преподавателю.</p>
            </div>
          ) : current ? (
            <Lesson key={current.id} lessonId={current.id} onProgress={reload} />
          ) : (
            <div className="card muted">Урок не найден</div>
          )}
        </main>
      </div>
    </div>
  )
}
