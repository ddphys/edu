import { course, lessons } from '../data/course.js'
import { allTasks } from '../lib.js'

const solvedOf = (l, p) => allTasks(l).filter((t) => p[t.id]?.status === 'correct').length

export default function LessonList({ progress, onReset }) {
  const hasProgress = Object.keys(progress).length > 0

  return (
    <>
      <section className="hero">
        <div className="muted">{course.badge}</div>
        <h1>{course.title}</h1>
        <p className="hero__about">{course.about}</p>
        <div className="teacher">
          <div className="teacher__photo">
            {course.teacher.photo ? <img src={course.teacher.photo} alt="" /> : course.teacher.name[0]}
          </div>
          <div>
            <div className="muted">Преподаватель</div>
            {course.teacher.name}
          </div>
        </div>
      </section>

      <h2 className="list-title">Уроки</h2>
      <nav className="lessons">
        {lessons.map((l, i) => {
          const solved = solvedOf(l, progress)
          const total = allTasks(l).length
          return (
            <a key={l.id} className="lesson-row" href={`#/lesson/${l.id}`}>
              <span className="lesson-row__num">{i + 1}</span>
              <span className="lesson-row__body">
                <span className="lesson-row__title">
                  {l.title}
                  {l.free && <span className="tag">Бесплатно</span>}
                </span>
                <span className="lesson-row__desc">{l.description.join(' · ')}</span>
              </span>
              <span className="lesson-row__progress">
                <span className={solved === total ? 'is-done' : ''}>
                  {solved} из {total} задач
                </span>
                <span className="bar">
                  <span style={{ width: `${(solved / total) * 100}%` }} />
                </span>
              </span>
              <span className="lesson-row__arrow" aria-hidden="true">
                →
              </span>
            </a>
          )
        })}
      </nav>

      {hasProgress && (
        <button className="link-btn" onClick={onReset}>
          Сбросить прогресс
        </button>
      )}
    </>
  )
}
