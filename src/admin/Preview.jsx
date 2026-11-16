import { Component, useEffect, useMemo } from 'react'
import Catalog from '../components/Catalog.jsx'
import Lesson from '../components/Lesson.jsx'
import LessonList from '../components/LessonList.jsx'
import { ImagesContext } from '../components/Math.jsx'
import { StoreProvider, useStore } from '../store.jsx'

// Если черновик заполнен наполовину, компонент ученика может не отрисоваться — редактор при этом должен жить
class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidUpdate(prev) {
    if (prev.version !== this.props.version && this.state.failed) this.setState({ failed: false })
  }
  render() {
    if (this.state.failed) return <p className="adm-hint">Предпросмотр не смог отрисовать страницу. Исправьте замечания в редакторе — он обновится сам.</p>
    return this.props.children
  }
}

function Inner({ api, version, courseId, lessonId, catalog }) {
  const { status, content, progress, actions } = useStore()

  // Черновик изменился — предпросмотр перечитывает контент (без перезагрузки видео и сброса решённого)
  useEffect(() => {
    api.invalidateContent()
    actions.reload()
  }, [api, actions, version])

  const course = content?.courses.find((c) => c.id === courseId)
  const images = useMemo(
    () => (name) => (course?.images?.[name] && api.imageUrl(course.id, name) ? { src: api.imageUrl(course.id, name), ...course.images[name] } : null),
    [api, course],
  )

  if (status === 'ready' && catalog)
    return (
      <>
        <div className="adm-preview__bar">
          <span>Так выглядит каталог курсов на главной странице.</span>
        </div>
        <div className="adm-preview__page">
          <Catalog site={content.site} courses={content.courses} progress={progress} imageUrl={(c, name) => api.imageUrl(c.id, name)} links={false} />
        </div>
      </>
    )
  if (status !== 'ready' || !course) return <p className="adm-hint">Предпросмотр появится, когда у курса будет id.</p>
  const lessons = course.lessons ?? []
  const index = lessons.findIndex((l) => l.id === lessonId)

  return (
    <ImagesContext.Provider value={images}>
      <div className="adm-preview__bar">
        <span>Так это видит ученик. Можно решать — прогресс предпросмотра никуда не сохраняется.</span>
        <button type="button" className="adm-link" onClick={() => actions.resetProgress()}>
          Начать заново
        </button>
      </div>
      <div className="adm-preview__page">
        {index !== -1 ? (
          <Lesson key={lessonId} course={course} lesson={lessons[index]} number={index + 1} links={false} />
        ) : (
          <LessonList course={course} progress={progress?.courses[course.id]} onReset={() => actions.resetProgress()} links={false} />
        )}
      </div>
    </ImagesContext.Provider>
  )
}

// Предпросмотр теми же компонентами, которые видит ученик.
// api — локальная реализация интерфейса поверх черновика (собирается в Admin.jsx).
export default function Preview({ api, version, courseId, lessonId, catalog = false }) {
  return (
    <StoreProvider api={api}>
      <Boundary version={version}>
        <Inner api={api} version={version} courseId={courseId} lessonId={lessonId} catalog={catalog} />
      </Boundary>
    </StoreProvider>
  )
}
