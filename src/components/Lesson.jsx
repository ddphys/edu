import { useState } from 'react'
import MathText from './Math.jsx'
import Video from './Video.jsx'
import Task from './Task.jsx'
import { emptyTaskState } from '../lib.js'

const STATUS = {
  pending: ['gray', 'Ждёт решения'],
  correct: ['green', 'Верно'],
  wrong: ['red', 'Неверно'],
  skipped: ['red', 'Не засчитано'],
}

export default function Lesson({ lesson, progress, setTaskState }) {
  const [active, setActive] = useState(0)
  const task = lesson.tasks[active]
  const st = (t) => progress[t.id] || emptyTaskState
  const xpEarned = lesson.tasks.reduce((s, t) => s + st(t).xp, 0)

  return (
    <div className="lesson">
      <section className="card">
        <h2 className="lesson__title">{lesson.title}</h2>
        <ul className="bullets">
          {lesson.description.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Запись занятия</h3>
        <Video url={lesson.videoUrl} title={lesson.title} vertical={lesson.videoVertical} />
      </section>

      <section className="card" id="homework">
        <div className="hw-head">
          <h3 className="section-title">Домашнее задание</h3>
          <div className="hw-head__stat">
            Заработано <b>{xpEarned} XP</b>
          </div>
        </div>
        <div className="hw">
          <ol className="hw__list">
            {lesson.tasks.map((t, i) => {
              const [color, label] = STATUS[st(t).status]
              return (
                <li key={t.id}>
                  <button
                    className={`hw__item ${i === active ? 'is-active' : ''}`}
                    onClick={() => setActive(i)}
                  >
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
            task={task}
            index={active}
            state={st(task)}
            onChange={(s) => setTaskState(task.id, s)}
            hasNext={active < lesson.tasks.length - 1}
            onNext={() => setActive(active + 1)}
          />
        </div>
      </section>
    </div>
  )
}
