import { useState } from 'react'
import Video from './Video.jsx'
import Task from './Task.jsx'
import { emptyTaskState } from '../lib.js'

const STATUS = {
  pending: ['gray', 'ждёт решения'],
  correct: ['green', 'решена верно'],
  wrong: ['red', 'решена неверно'],
  skipped: ['red', 'не засчитана'],
}

export default function Lesson({ lesson, number, prev, next, progress, setTaskState }) {
  const st = (t) => progress[t.id] || emptyTaskState
  // Открываем первую ещё не решённую задачу
  const [active, setActive] = useState(() => {
    const i = lesson.tasks.findIndex((t) => st(t).status === 'pending')
    return i === -1 ? 0 : i
  })
  const task = lesson.tasks[active]
  const xpEarned = lesson.tasks.reduce((s, t) => s + st(t).xp, 0)

  return (
    <div className="lesson">
      <a className="back" href="#/">
        ← Все уроки
      </a>

      <header className="lesson__head">
        <div className="muted">Урок {number}</div>
        <h1>{lesson.title}</h1>
        <ul className="bullets">
          {lesson.description.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </header>

      <section className="section">
        <h2 className="section-title">Запись занятия</h2>
        <Video url={lesson.videoUrl} title={lesson.title} vertical={lesson.videoVertical} />
      </section>

      <section className="section" id="homework">
        <div className="hw-head">
          <h2 className="section-title">Домашнее задание</h2>
          <div className="hw-head__stat">
            Заработано <b>{xpEarned} XP</b>
          </div>
        </div>

        <div className="card">
          <div className="steps" role="tablist" aria-label="Задачи">
            {lesson.tasks.map((t, i) => {
              const [color, label] = STATUS[st(t).status]
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={i === active}
                  title={`Задача ${i + 1}: ${t.title} — ${label}`}
                  className={`step step--${color} ${i === active ? 'is-active' : ''}`}
                  onClick={() => setActive(i)}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <Task
            key={task.id}
            task={task}
            index={active}
            state={st(task)}
            onChange={(s) => setTaskState(task.id, s)}
            hasNext={active < lesson.tasks.length - 1}
            onNext={() => setActive(active + 1)}
          />
        </div>
      </section>

      <nav className="lesson-nav">
        {prev ? (
          <a href={`#/lesson/${prev.id}`}>
            <small>← Предыдущий урок</small>
            {prev.title}
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a className="lesson-nav__next" href={`#/lesson/${next.id}`}>
            <small>Следующий урок →</small>
            {next.title}
          </a>
        ) : (
          <span />
        )}
      </nav>
    </div>
  )
}
