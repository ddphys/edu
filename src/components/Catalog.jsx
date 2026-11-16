import { courseTasks, plural } from '../lib.js'
import { href } from '../routes.js'

// Каталог курсов: карточки с обложкой, описанием и прогрессом ученика.
//   imageUrl(курс, имя файла) — адрес картинки; links: false — карточки не ведут никуда (предпросмотр)
export default function Catalog({ site, courses, progress, imageUrl, links = true }) {
  return (
    <>
      <section className="hero hero--catalog">
        <h1>{site.title || 'Курсы'}</h1>
        {site.about && <p className="hero__about">{site.about}</p>}
      </section>

      {courses.length === 0 && <p className="muted">Курсов пока нет.</p>}
      <nav className="catalog" aria-label="Курсы">
        {courses.map((course) => {
          const tasks = courseTasks(course)
          const saved = progress?.courses?.[course.id]?.tasks ?? {}
          const solved = tasks.filter((t) => saved[t.id]?.status === 'correct').length
          const xp = tasks.reduce((sum, t) => sum + (saved[t.id]?.xp || 0), 0)
          const lessons = (course.lessons ?? []).length
          const cover = course.cover && course.images?.[course.cover] ? imageUrl(course, course.cover) : null
          const Card = links ? 'a' : 'div'
          return (
            <Card key={course.id} className="course-card" {...(links ? { href: href.course(course.id) } : {})}>
              <span className="course-card__cover">
                {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">{(course.title || '?').trim()[0]}</span>}
              </span>
              <span className="course-card__body">
                <span className="course-card__title">{course.title}</span>
                {course.about && <span className="course-card__about">{course.about}</span>}
                <span className="course-card__meta">
                  {lessons} {plural(lessons, 'урок', 'урока', 'уроков')} · {tasks.length} {plural(tasks.length, 'задача', 'задачи', 'задач')}
                  {course.teacher?.name ? ` · ${course.teacher.name}` : ''}
                </span>
                {tasks.length > 0 && (
                  <span className="course-card__progress">
                    <span className="bar">
                      <span style={{ width: `${(solved / tasks.length) * 100}%` }} />
                    </span>
                    <span className={solved === tasks.length ? 'is-done' : ''}>
                      {solved > 0 || xp > 0 ? `Решено ${solved} из ${tasks.length} · ${xp} XP` : 'Ещё не начат'}
                    </span>
                  </span>
                )}
              </span>
            </Card>
          )
        })}
      </nav>
    </>
  )
}
