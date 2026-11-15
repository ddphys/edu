import { useEffect, useState } from 'react'
import { course, lessons } from './data/course.js'
import Lesson from './components/Lesson.jsx'
import LessonList from './components/LessonList.jsx'
import { emptyTaskState, loadProgress, saveProgress } from './lib.js'

// Адрес страницы хранится в хэше: «#/» — список уроков, «#/lesson/l1» — урок.
// Так работает кнопка «Назад» в браузере и ссылку на урок можно переслать.
const lessonIdFromHash = () => window.location.hash.match(/^#\/lesson\/(.+)$/)?.[1] ?? null

export default function App() {
  const [progress, setProgress] = useState(loadProgress)
  const [lessonId, setLessonId] = useState(lessonIdFromHash)

  useEffect(() => saveProgress(progress), [progress])
  useEffect(() => {
    const onHash = () => {
      setLessonId(lessonIdFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const index = lessons.findIndex((l) => l.id === lessonId)
  const lesson = lessons[index]
  const totalXp = Object.values(progress).reduce((s, t) => s + (t.xp || 0), 0)

  const setTaskState = (id, s) => setProgress((p) => ({ ...p, [id]: { ...emptyTaskState, ...s } }))
  const reset = () => {
    if (confirm('Сбросить весь прогресс и XP?')) setProgress({})
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar__in">
          <a className="topbar__title" href="#/">
            {course.title}
          </a>
          <span className="xp">{totalXp} XP</span>
        </div>
      </header>

      <div className="page">
        {lesson ? (
          <Lesson
            key={lesson.id}
            lesson={lesson}
            number={index + 1}
            prev={lessons[index - 1]}
            next={lessons[index + 1]}
            progress={progress}
            setTaskState={setTaskState}
          />
        ) : (
          <LessonList progress={progress} onReset={reset} />
        )}
      </div>
    </>
  )
}
