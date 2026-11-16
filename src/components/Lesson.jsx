import { useEffect, useState } from 'react'
import Video from './Video.jsx'
import Task from './Task.jsx'
import { allTasks, isGroup, normalizeState } from '../lib.js'
import { href } from '../routes.js'
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
// Отдельная задача урока. Решённая в прошлый раз свёрнута в строку и раскрывается по щелчку;
// решённая только что остаётся открытой — ученик читает разбор.
function TaskCard({ props, number }) {
  const { task, state } = props
  const [wasDone] = useState(state.status !== 'pending')
  const [open, setOpen] = useState(false)
  if (!wasDone)
    return (
      <div className="card">
        <Task {...props} index={number - 1} hasNext={false} />
      </div>
    )
  const ok = state.status === 'correct'
  return (
    <div className="card card--row">
      <button type="button" className="task-row" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={`task-row__mark ${ok ? 'is-ok' : ''}`} aria-hidden="true">
          {ok ? '✓' : '–'}
        </span>
        <span className="task-row__title">
          {number}. {task.title}
        </span>
        <span className="task-row__xp">{ok ? `+${state.xp} XP` : 'не засчитана'}</span>
        <span className="task-row__chev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <Task {...props} index={number - 1} hasNext={false} showTitle={false} />}
    </div>
  )
}

// links: false — без переходов между страницами (предпросмотр в редакторе)
export default function Lesson({ course, lesson, number, prev, next, links = true }) {
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
      submit: (input, meta) => actions.submitAnswer(course.id, task.id, input, meta),
      hint: (meta) => actions.takeHint(course.id, task.id, meta),
      skip: (meta) => actions.skipTask(course.id, task.id, meta),
    },
  })

  // Сквозная нумерация задач по всему уроку
  let count = 0

  return (
    <div className="lesson">
      {links && (
        <a className="back" href={href.course(course.id)}>
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

      <section className="section" aria-label="Запись занятия">
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
              Решено {solved} из {tasks.length} · {xpEarned} XP
            </div>
          </div>
          {links && (
            <a className="print-link" href={href.print(course.id, lesson.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
              </svg>
              Версия для печати
            </a>
          )}

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
                <TaskCard key={item.id} props={taskProps(item)} number={first} />
              )
            })}
          </div>
        </section>
      )}

      {links && (
        <nav className="lesson-nav">
          {prev ? (
            <a href={href.lesson(course.id, prev.id)}>
              <small>← Предыдущий урок</small>
              {prev.title}
            </a>
          ) : (
            <span />
          )}
          {next ? (
            <a className="lesson-nav__next" href={href.lesson(course.id, next.id)}>
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
