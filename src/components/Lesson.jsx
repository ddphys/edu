import { useEffect, useState } from 'react'
import Video from './Video.jsx'
import Task from './Task.jsx'
import { api } from '../api.js'

const STATUS = {
  pending: ['gray', 'Ждёт решения'],
  correct: ['green', 'Верно'],
  wrong: ['red', 'Неверно'],
  skipped: ['red', 'Не засчитано'],
}

export default function Lesson({ lessonId, onProgress }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    api.get(`/api/lessons/${lessonId}`).then(setData).catch((e) => setError(e.message))
  }, [lessonId])

  if (error) return <div className="card msg">{error}</div>
  if (!data) return <div className="card muted">Загрузка…</div>

  const { lesson, tasks } = data
  const task = tasks[active]
  const xpEarned = tasks.reduce((s, t) => s + t.state.xp, 0)

  const updateTask = (t) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === t.id ? t : x)) }))
    if (t.state.status !== 'pending') onProgress?.()
  }

  return (
    <div className="lesson">
      <section className="card">
        <h2 className="lesson__title">{lesson.title}</h2>
        {lesson.description.length > 0 && (
          <ul className="bullets">
            {lesson.description.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </section>

      {lesson.videoUrl && (
        <section className="card">
          <h3 className="section-title">Запись занятия</h3>
          <Video url={lesson.videoUrl} title={lesson.title} vertical={lesson.videoVertical} />
        </section>
      )}

      {tasks.length > 0 && (
        <section className="card" id="homework">
          <div className="hw-head">
            <h3 className="section-title">Домашнее задание</h3>
            <div className="hw-head__stat">
              Заработано <b>{xpEarned} XP</b>
            </div>
          </div>
          <div className="hw">
            <ol className="hw__list">
              {tasks.map((t, i) => {
                const [color, label] = STATUS[t.state.status]
                return (
                  <li key={t.id}>
                    <button className={`hw__item ${i === active ? 'is-active' : ''}`} onClick={() => setActive(i)}>
                      <span className={`dot dot--${color}`} /> <small>{label}</small>
                      <span className="hw__name">
                        {i + 1} {t.title}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            <Task
              key={task.id}
              lessonId={lesson.id}
              task={task}
              index={active}
              onUpdate={updateTask}
              hasNext={active < tasks.length - 1}
              onNext={() => setActive(active + 1)}
            />
          </div>
        </section>
      )}
    </div>
  )
}
