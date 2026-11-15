import { useEffect, useState } from 'react'
import Lesson from './components/Lesson.jsx'
import LessonList from './components/LessonList.jsx'
import { totalXp } from './api/progress.js'
import { useStore } from './store.jsx'

// Адрес страницы хранится в хэше: «#/» — список уроков, «#/lesson/l1» — урок.
// Так работает кнопка «Назад» в браузере и ссылку на урок можно переслать.
const pct = (x) => Math.round(x * 100) + '%'

const lessonIdFromHash = () => window.location.hash.match(/^#\/lesson\/(.+)$/)?.[1] ?? null

export default function App() {
  const { status, error, content, progress, actions } = useStore()
  const [lessonId, setLessonId] = useState(lessonIdFromHash)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    const onHash = () => {
      setLessonId(lessonIdFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (status === 'loading') return <div className="page muted">Загрузка…</div>
  if (status === 'error')
    return (
      <div className="page">
        <p>Не удалось загрузить курс. Проверьте связь и обновите страницу.</p>
        <p className="muted">{String(error?.message ?? error)}</p>
      </div>
    )

  const course = content.courses[0]
  const lessons = course.lessons ?? []
  const xpLevels = Object.values(course.levelXp)
  const index = lessons.findIndex((l) => l.id === lessonId)
  const lesson = lessons[index]

  const reset = () => {
    if (confirm('Сбросить весь прогресс и XP?')) actions.resetProgress(course.id)
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar__in">
          <a className="topbar__title" href="#/">
            {course.title}
          </a>
          <button className="xp" onClick={() => setShowRules((v) => !v)} title="Как начисляется опыт">
            {totalXp(progress)} XP <span className="xp__q">?</span>
          </button>
        </div>
        {showRules && (
          <div className="topbar__in">
            <ul className="rules">
              <li>
                Задача стоит от {Math.min(...xpLevels)} до {Math.max(...xpLevels)} XP — чем сложнее, тем дороже.
              </li>
              <li>
                Ошибка −{pct(course.errorPenalty)} цены, подсказка −{pct(course.hintPenalty)}. Решили сами — получите
                не меньше {pct(course.minShare)}.
              </li>
              <li>«Я не знаю» открывает решение, но XP за задачу не будет.</li>
            </ul>
          </div>
        )}
      </header>

      <div className="page">
        {lesson ? (
          <Lesson
            key={lesson.id}
            course={course}
            lesson={lesson}
            number={index + 1}
            prev={lessons[index - 1]}
            next={lessons[index + 1]}
          />
        ) : (
          <LessonList course={course} progress={progress.courses[course.id]} onReset={reset} />
        )}
      </div>
    </>
  )
}
