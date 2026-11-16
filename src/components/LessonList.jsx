import { useContext } from 'react'
import { allTasks, courseTasks, plural } from '../lib.js'
import { href } from '../routes.js'
import { ImagesContext } from './Math.jsx'
import Poster from './Poster.jsx'

const solvedOf = (l, tasks) => allTasks(l).filter((t) => tasks[t.id]?.status === 'correct').length

// Страница курса: описание и список уроков. progress — сохранённый прогресс по этому курсу.
// links: false — без переходов (предпросмотр в редакторе).
export default function LessonList({ course, progress, onReset, links = true }) {
  const lessons = course.lessons ?? []
  const tasks = progress?.tasks ?? {}
  // Фото преподавателя — картинка курса или ссылка
  const image = useContext(ImagesContext)
  const photo = course.teacher?.photo
  const photoSrc = photo ? (/^https?:\/\//.test(photo) ? photo : image(photo)?.src) : null
  const cover = course.cover ? image(course.cover)?.src : null
  const hasProgress = Object.keys(tasks).length > 0 || Object.keys(progress?.quiz ?? {}).length > 0
  const all = courseTasks(course)
  const solvedAll = all.filter((t) => tasks[t.id]?.status === 'correct').length
  const xp = all.reduce((sum, t) => sum + (tasks[t.id]?.xp || 0), 0)
  const facts = [
    { value: lessons.length, label: plural(lessons.length, 'урок', 'урока', 'уроков') },
    ...(all.length > 0
      ? [
          { value: all.length, label: plural(all.length, 'задача', 'задачи', 'задач') },
          { value: solvedAll, label: 'решено' },
          { value: xp, label: 'XP' },
        ]
      : []),
  ]

  return (
    <>
      <Poster
        className="poster--course"
        back={links ? { href: href.catalog(), text: 'Все курсы' } : null}
        title={course.title}
        facts={facts}
        done={all.length > 0 && solvedAll === all.length}
        aside={cover && <img className="poster__cover" src={cover} alt="" />}
      >
        {course.about && <p className="poster__about">{course.about}</p>}
        <div className="teacher">
          <div className="teacher__photo">{photoSrc ? <img src={photoSrc} alt="" /> : (course.teacher?.name || '?')[0]}</div>
          <div>
            <div className="teacher__role">Преподаватель</div>
            {course.teacher?.name}
          </div>
        </div>
      </Poster>

      <h2 className="list-title">Уроки</h2>
      <nav className="lessons">
        {lessons.map((l, i) => {
          const solved = solvedOf(l, tasks)
          const total = allTasks(l).length
          return (
            <a key={l.id} className={`lesson-row ${total > 0 && solved === total ? 'lesson-row--done' : ''}`} href={links ? href.lesson(course.id, l.id) : undefined}>
              <span className="lesson-row__num">{i + 1}</span>
              <span className="lesson-row__body">
                <span className="lesson-row__title">{l.title}</span>
                <span className="lesson-row__desc">{(l.description ?? []).join(' · ')}</span>
              </span>
              <span className="lesson-row__progress">
                {total > 0 ? (
                  <>
                    <span className={solved === total ? 'is-done' : ''}>
                      {solved} из {total} задач
                    </span>
                    <span className="bar">
                      <span style={{ width: `${(solved / total) * 100}%` }} />
                    </span>
                  </>
                ) : (
                  <span>Без задач</span>
                )}
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
          Сбросить прогресс по курсу
        </button>
      )}
    </>
  )
}
