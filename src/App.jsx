import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import Catalog from './components/Catalog.jsx'
import Lesson from './components/Lesson.jsx'
import LessonList from './components/LessonList.jsx'
import PrintSheet from './components/PrintSheet.jsx'
import { ImagesContext } from './components/Math.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { totalXp } from './api/progress.js'
import { href, legacyTarget, parseRoute } from './routes.js'
import { useStore } from './store.jsx'

const pct = (x) => Math.round(x * 100) + '%'

// Редактор курса подгружается отдельно: на страницу ученика его код не попадает
const Admin = lazy(() => import('./admin/Admin.jsx'))
// Бланк проверки ЕГЭ — тоже отдельным файлом, курсы ему не нужны
const Ege = lazy(() => import('./ege/Ege.jsx'))

const currentRoute = () => parseRoute(window.location.hash)

function NotFound({ what }) {
  return (
    <div className="notfound">
      <h1>{what} не найден</h1>
      <p className="muted">Возможно, ссылка устарела или в ней опечатка.</p>
      <a className="btn btn--primary" href={href.catalog()}>
        К списку курсов
      </a>
    </div>
  )
}

export default function App() {
  const { status, error, content, progress, actions, api } = useStore()
  const [route, setRoute] = useState(currentRoute)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    const onHash = () => {
      setRoute(currentRoute())
      setShowRules(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Правила опыта закрываются по Esc и по щелчку мимо них
  useEffect(() => {
    if (!showRules) return
    const onKey = (e) => e.key === 'Escape' && setShowRules(false)
    const onDown = (e) => !e.target.closest?.('.rules, .xp') && setShowRules(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [showRules])

  const ready = status === 'ready'
  const course = ready && route.courseId ? content.courses.find((c) => c.id === route.courseId) : null
  const lessons = course?.lessons ?? []
  const index = route.page === 'lesson' || route.page === 'print' ? lessons.findIndex((l) => l.id === route.lessonId) : -1
  const lesson = lessons[index]

  // Старая ссылка #/lesson/l1 — подменяем адрес на новый (кнопка «Назад» при этом не ломается)
  const redirect = ready && route.page === 'legacy-lesson' ? legacyTarget(route.lessonId, content) : null
  useEffect(() => {
    if (redirect) window.location.replace(redirect)
  }, [redirect])

  // Картинки курса: имя файла → адрес и размер
  const images = useMemo(
    () => (name) => (course?.images?.[name] ? { src: api.imageUrl(course.id, name), ...course.images[name] } : null),
    [api, course],
  )

  const title = ready && route.page !== 'ege' ? [lesson?.title, course?.title, content.site.title].filter(Boolean).join(' · ') : ''
  useEffect(() => {
    if (title) document.title = title
  }, [title])

  // Вид страницы зависит от того, что открыто: у страниц ученика — белый лист (см. начало styles.css)
  useLayoutEffect(() => {
    document.documentElement.dataset.page = route.page
  }, [route.page])

  if (route.page === 'admin')
    return (
      <Suspense fallback={<div className="page muted">Открываем редактор…</div>}>
        <Admin />
      </Suspense>
    )

  if (route.page === 'ege')
    return (
      <Suspense fallback={<div className="page muted">Открываем бланк…</div>}>
        <Ege view={route.view} />
      </Suspense>
    )

  if (status === 'loading' || redirect) return <div className="page muted">Загрузка…</div>
  if (status === 'error')
    return (
      <div className="page">
        <p>Не удалось загрузить курсы. Проверьте связь и обновите страницу.</p>
        <p className="muted">{String(error?.message ?? error)}</p>
      </div>
    )

  const { site, courses } = content
  const xpLevels = course ? Object.values(course.levelXp) : []
  const reset = () => {
    if (confirm(`Сбросить весь прогресс и XP по курсу «${course.title}»?`)) actions.resetProgress(course.id)
  }

  // Каталог, курс и урок открываются плакатной шапкой во всю ширину окна — она встаёт вплотную к шапке сайта
  const poster = Boolean(route.page === 'catalog' || (route.page === 'course' && course) || (route.page === 'lesson' && lesson))

  let body
  if (route.page === 'catalog') body = <Catalog site={site} courses={courses} progress={progress} imageUrl={(c, name) => api.imageUrl(c.id, name)} />
  else if (route.page === 'legacy-lesson') body = <NotFound what="Урок" />
  else if (!course) body = <NotFound what={route.page === 'unknown' ? 'Адрес' : 'Курс'} />
  else if (route.page === 'course') body = <LessonList course={course} progress={progress.courses[course.id]} onReset={reset} />
  else if (!lesson) body = <NotFound what="Урок" />
  else if (route.page === 'print') body = <PrintSheet key={`${course.id}/${lesson.id}`} course={course} lesson={lesson} number={index + 1} />
  else body = <Lesson key={`${course.id}/${lesson.id}`} course={course} lesson={lesson} number={index + 1} prev={lessons[index - 1]} next={lessons[index + 1]} />

  return (
    <ImagesContext.Provider value={images}>
      <header className="topbar">
        <div className="topbar__in">
          <div className="topbar__title">
            <a href={href.catalog()}>{site.title || 'Курсы'}</a>
            {course && (
              <>
                <span className="topbar__sep" aria-hidden="true">
                  /
                </span>
                <a href={href.course(course.id)}>{course.title}</a>
              </>
            )}
          </div>
          <div className="topbar__right">
            <ThemeToggle />
            <button className="xp" onClick={() => setShowRules((v) => !v)} title="Как начисляется опыт" aria-expanded={showRules}>
              {totalXp(progress)} XP <span className="xp__q">?</span>
            </button>
          </div>
        </div>
        {showRules && (
          <div className="topbar__in topbar__in--pop">
            <div className="rules" role="dialog" aria-label="Как начисляется опыт">
              <h2 className="rules__title">Как начисляется опыт</h2>
              {course ? (
                <>
                  <dl className="rules__facts">
                    <div>
                      <dt>за задачу</dt>
                      <dd>
                        {Math.min(...xpLevels)}–{Math.max(...xpLevels)} XP
                      </dd>
                    </div>
                    <div>
                      <dt>ошибка</dt>
                      <dd>−{pct(course.errorPenalty)}</dd>
                    </div>
                    <div>
                      <dt>подсказка</dt>
                      <dd>−{pct(course.hintPenalty)}</dd>
                    </div>
                  </dl>
                  <ul className="rules__list">
                    <li>Чем сложнее задача, тем она дороже. Ошибка и подсказка снимают часть её цены.</li>
                    <li>Решили сами — получите не меньше {pct(course.minShare)} цены.</li>
                    <li>«Я не знаю» открывает решение, но XP за задачу не будет.</li>
                    <li>
                      В этом курсе у вас {totalXp(progress, course.id)} XP. В шапке — сумма по всем курсам.
                    </li>
                  </ul>
                </>
              ) : (
                <ul className="rules__list">
                  <li>XP начисляется за решённые задачи. В шапке — сумма по всем курсам.</li>
                  <li>Чем сложнее задача, тем она дороже. Ошибки и подсказки уменьшают награду.</li>
                  <li>«Я не знаю» открывает решение, но XP за задачу не будет.</li>
                </ul>
              )}
            </div>
          </div>
        )}
      </header>

      <div className={`page ${poster ? 'page--poster' : ''}`}>{body}</div>
    </ImagesContext.Provider>
  )
}
