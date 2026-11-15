import { useState } from 'react'
import Video from './Video.jsx'
import Task from './Task.jsx'
import { allTasks, emptyTaskState } from '../lib.js'

const STATUS = {
  pending: ['gray', 'ждёт решения'],
  correct: ['green', 'решена верно'],
  wrong: ['red', 'решена неверно'],
  skipped: ['red', 'не засчитана'],
}

// Несколько задач в одной ячейке: сверху номера, ниже выбранная задача
function TaskGroup({ group, firstNumber, st, setTaskState }) {
  // Открываем первую ещё не решённую задачу
  const [active, setActive] = useState(() => {
    const i = group.tasks.findIndex((t) => st(t).status === 'pending')
    return i === -1 ? 0 : i
  })
  const task = group.tasks[active]

  return (
    <div className="card">
      {group.title && <div className="group-title">{group.title}</div>}
      <div className="steps" role="tablist" aria-label={group.title || 'Задачи'}>
        {group.tasks.map((t, i) => {
          const [color, label] = STATUS[st(t).status]
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={i === active}
              title={`Задача ${firstNumber + i}: ${t.title} — ${label}`}
              className={`step step--${color} ${i === active ? 'is-active' : ''}`}
              onClick={() => setActive(i)}
            >
              {firstNumber + i}
            </button>
          )
        })}
      </div>
      <Task
        key={task.id}
        task={task}
        index={firstNumber + active - 1}
        state={st(task)}
        onChange={(s) => setTaskState(task.id, s)}
        hasNext={active < group.tasks.length - 1}
        onNext={() => setActive(active + 1)}
      />
    </div>
  )
}

export default function Lesson({ lesson, number, prev, next, progress, setTaskState, quizState, onQuizAnswer }) {
  const st = (t) => progress[t.id] || emptyTaskState
  const tasks = allTasks(lesson)
  const xpEarned = tasks.reduce((s, t) => s + st(t).xp, 0)
  const solved = tasks.filter((t) => st(t).status === 'correct').length

  // Сквозная нумерация задач по всему уроку
  let count = 0

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
        <Video
          url={lesson.videoUrl}
          title={lesson.title}
          vertical={lesson.videoVertical}
          quiz={lesson.quiz}
          quizState={quizState}
          onQuizAnswer={onQuizAnswer}
        />
      </section>

      <section className="section" id="homework">
        <div className="hw-head">
          <h2 className="section-title">Домашнее задание</h2>
          <div className="hw-head__stat">
            Решено {solved} из {tasks.length} · <b>{xpEarned} XP</b>
          </div>
        </div>

        <div className="hw">
          {lesson.tasks.map((item) => {
            const first = count + 1
            if (Array.isArray(item.tasks)) {
              count += item.tasks.length
              return (
                <TaskGroup
                  key={item.tasks[0].id}
                  group={item}
                  firstNumber={first}
                  st={st}
                  setTaskState={setTaskState}
                />
              )
            }
            count += 1
            return (
              <div className="card" key={item.id}>
                <Task
                  task={item}
                  index={first - 1}
                  state={st(item)}
                  onChange={(s) => setTaskState(item.id, s)}
                  hasNext={false}
                />
              </div>
            )
          })}
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
