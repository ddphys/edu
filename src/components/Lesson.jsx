import { useEffect, useState } from 'react'
import Video from './Video.jsx'
import Task from './Task.jsx'
import { allTasks, isGroup, normalizeState } from '../lib.js'
import { useStore } from '../store.jsx'

const STATUS = {
  pending: ['gray', 'ждёт решения'],
  correct: ['green', 'решена верно'],
  wrong: ['red', 'решена неверно'],
  skipped: ['red', 'не засчитана'],
}

// Несколько задач в одной ячейке: сверху номера, ниже выбранная задача
function TaskGroup({ group, firstNumber, st, taskProps }) {
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
          const [color, label] = STATUS[st(t).status] ?? STATUS.pending
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
        {...taskProps(task)}
        index={firstNumber + active - 1}
        hasNext={active < group.tasks.length - 1}
        onNext={() => setActive(active + 1)}
      />
    </div>
  )
}

// course и lesson — открытая часть контента; прогресс и действия берутся из общего состояния
// links — адреса для переходов: { back, lesson(id) }; без них (предпросмотр в редакторе) ссылок нет
const DEFAULT_LINKS = { back: '#/', lesson: (id) => `#/lesson/${id}` }

export default function Lesson({ course, lesson, number, prev, next, links = DEFAULT_LINKS }) {
  const { progress, actions, revealedOf, viewer } = useStore()
  const saved = progress.courses[course.id]
  const st = (t) => normalizeState(saved?.tasks?.[t.id])
  const tasks = allTasks(lesson)
  const xpEarned = tasks.reduce((s, t) => s + (st(t).xp || 0), 0)
  const solved = tasks.filter((t) => st(t).status === 'correct').length

  // Открытые подсказки и разборы уже начатых задач приходят отдельным запросом
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    actions
      .loadRevealed(course.id, allTasks(lesson).map((t) => t.id))
      .catch(() => {})
      .then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [actions, course.id, lesson])

  const taskProps = (task) => ({
    course,
    task,
    state: st(task),
    revealed: revealedOf(course.id, task.id),
    canAttach: Boolean(viewer?.features?.attachSolution),
    actions: {
      submit: (input) => actions.submitAnswer(course.id, task.id, input),
      hint: () => actions.takeHint(course.id, task.id),
      skip: () => actions.skipTask(course.id, task.id),
    },
  })

  // Сквозная нумерация задач по всему уроку
  let count = 0

  return (
    <div className="lesson">
      {links && (
        <a className="back" href={links.back}>
          ← Все уроки
        </a>
      )}

      <header className="lesson__head">
        <div className="muted">Урок {number}</div>
        <h1>{lesson.title}</h1>
        <ul className="bullets">
          {(lesson.description ?? []).map((d) => (
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
          quizState={saved?.quiz?.[lesson.id]}
          onQuizAnswer={(i, choice, options) => actions.answerQuiz(course.id, lesson.id, i, choice, options)}
          onQuizSkipRetry={(i) => actions.skipQuizRetry(course.id, lesson.id, i)}
        />
      </section>

      {tasks.length > 0 && ready && (
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
              if (isGroup(item)) {
                if (item.tasks.length === 0) return null
                count += item.tasks.length
                return (
                  <TaskGroup
                    key={item.tasks[0].id}
                    group={item}
                    firstNumber={first}
                    st={st}
                    taskProps={taskProps}
                  />
                )
              }
              count += 1
              return (
                <div className="card" key={item.id}>
                  <Task {...taskProps(item)} index={first - 1} hasNext={false} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {links && (
        <nav className="lesson-nav">
          {prev ? (
            <a href={links.lesson(prev.id)}>
              <small>← Предыдущий урок</small>
              {prev.title}
            </a>
          ) : (
            <span />
          )}
          {next ? (
            <a className="lesson-nav__next" href={links.lesson(next.id)}>
              <small>Следующий урок →</small>
              {next.title}
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
