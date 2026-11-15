import { useEffect, useState } from 'react'
import { course, lessons } from './data/course.js'
import Lesson from './components/Lesson.jsx'
import LessonList from './components/LessonList.jsx'
import { emptyTaskState, loadProgress, saveProgress } from './lib.js'

// Адрес страницы хранится в хэше: «#/» — список уроков, «#/lesson/l1» — урок.
// Так работает кнопка «Назад» в браузере и ссылку на урок можно переслать.
const pct = (x) => Math.round(x * 100) + '%'
const xpLevels = Object.values(course.levelXp)

const lessonIdFromHash = () => window.location.hash.match(/^#\/lesson\/(.+)$/)?.[1] ?? null

export default function App() {
  const [progress, setProgress] = useState(loadProgress)
  const [lessonId, setLessonId] = useState(lessonIdFromHash)
  const [showRules, setShowRules] = useState(false)

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
  // Ответы на вопросы в видео лежат там же, под ключом «quiz:<id урока>»
  const setQuizAnswer = (id, i, a) =>
    setProgress((p) => ({ ...p, [`quiz:${id}`]: { ...p[`quiz:${id}`], [i]: a } }))
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
          <button className="xp" onClick={() => setShowRules((v) => !v)} title="Как начисляется опыт">
            {totalXp} XP <span className="xp__q">?</span>
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
            lesson={lesson}
            number={index + 1}
            prev={lessons[index - 1]}
            next={lessons[index + 1]}
            progress={progress}
            setTaskState={setTaskState}
            quizState={progress[`quiz:${lesson.id}`]}
            onQuizAnswer={(i, a) => setQuizAnswer(lesson.id, i, a)}
          />
        ) : (
          <LessonList progress={progress} onReset={reset} />
        )}
      </div>
    </>
  )
}
