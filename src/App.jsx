import { useEffect, useState } from 'react'
import { course, lessons } from './data/course.js'
import Lesson from './components/Lesson.jsx'
import { emptyTaskState, loadProgress, saveProgress } from './lib.js'

const solvedOf = (l, p) => l.tasks.filter((t) => p[t.id]?.status === 'correct').length

export default function App() {
  const [progress, setProgress] = useState(loadProgress)
  const [lessonId, setLessonId] = useState(lessons[0].id)
  const [showAbout, setShowAbout] = useState(false)

  useEffect(() => saveProgress(progress), [progress])

  const lesson = lessons.find((l) => l.id === lessonId)
  const totalXp = Object.values(progress).reduce((s, t) => s + (t.xp || 0), 0)

  const setTaskState = (id, s) => setProgress((p) => ({ ...p, [id]: { ...emptyTaskState, ...s } }))
  const reset = () => {
    if (confirm('Сбросить весь прогресс и XP?')) setProgress({})
  }

  return (
    <div className="page">
      <header className="card course-head">
        <div>
          <div className="muted">{course.badge}</div>
          <h1>{course.title}</h1>
          <div className="chips">
            <button className="chip" onClick={() => setShowAbout((v) => !v)}>
              О курсе
            </button>
            <span className="chip">Опыт {totalXp} XP</span>
            <button className="chip chip--link" onClick={reset}>
              Сбросить прогресс
            </button>
          </div>
          {showAbout && <p className="about">{course.about}</p>}
        </div>
        <div className="teacher">
          <span>{course.teacher.name}</span>
          <div className="teacher__photo">
            {course.teacher.photo ? <img src={course.teacher.photo} alt="" /> : course.teacher.name[0]}
          </div>
        </div>
      </header>

      <div className="layout">
        <nav className="card lessons">
          {lessons.map((l, i) => (
            <button
              key={l.id}
              className={`lessons__item ${l.id === lessonId ? 'is-active' : ''}`}
              onClick={() => setLessonId(l.id)}
            >
              <span className="lessons__num">{i + 1}</span>
              <span>
                <span className="lessons__title">{l.title}</span>
                <small>
                  Решено задач: {solvedOf(l, progress)} из {l.tasks.length}
                </small>
                {l.free && <span className="tag">Бесплатно</span>}
              </span>
            </button>
          ))}
        </nav>
        <main>
          <Lesson key={lesson.id} lesson={lesson} progress={progress} setTaskState={setTaskState} />
        </main>
      </div>
    </div>
  )
}
