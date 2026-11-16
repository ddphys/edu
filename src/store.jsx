import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Общее состояние страницы: контент, прогресс ученика и действия над задачами.
// Всё идёт через интерфейс api (см. api/index.js) — компоненты не знают, что за ним стоит.
const StoreContext = createContext(null)
export const useStore = () => useContext(StoreContext)

const key = (courseId, taskId) => `${courseId}/${taskId}`

export function StoreProvider({ api, children }) {
  const [data, setData] = useState({ status: 'loading' })
  const [progress, setProgress] = useState(null)
  // Что ученику уже можно видеть по задачам: открытые подсказки, разбор, верные ответы
  const [revealed, setRevealed] = useState({})

  const load = useCallback(async () => {
    try {
      const [content, viewer, saved] = await Promise.all([api.getContent(), api.getViewer(), api.getProgress()])
      setProgress(saved)
      setData({ status: 'ready', content, viewer })
    } catch (error) {
      setData({ status: 'error', error })
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  const actions = useMemo(() => {
    const putTask = (courseId, taskId, result) => {
      setRevealed((r) => ({ ...r, [key(courseId, taskId)]: result.revealed }))
      if (['noop', 'locked', 'invalid'].includes(result.kind)) return
      setProgress((p) => {
        const course = p.courses[courseId] ?? { tasks: {}, quiz: {} }
        return { ...p, courses: { ...p.courses, [courseId]: { ...course, tasks: { ...course.tasks, [taskId]: result.state } } } }
      })
    }
    const putQuiz = (courseId, lessonId, index, saved) =>
      setProgress((p) => {
        const course = p.courses[courseId] ?? { tasks: {}, quiz: {} }
        const quiz = { ...course.quiz, [lessonId]: { ...course.quiz?.[lessonId], [index]: saved } }
        return { ...p, courses: { ...p.courses, [courseId]: { ...course, quiz } } }
      })
    const taskAction = (method) => async (courseId, taskId, ...args) => {
      const result = await api[method](courseId, taskId, ...args)
      putTask(courseId, taskId, result)
      return result
    }

    return {
      reload: load,
      // Загрузить для задач урока то, что по ним уже открыто
      async loadRevealed(courseId, taskIds) {
        const map = await api.getRevealed(courseId, taskIds)
        setRevealed((r) => ({ ...r, ...Object.fromEntries(Object.entries(map).map(([id, v]) => [key(courseId, id), v])) }))
      },
      takeHint: taskAction('takeHint'),
      submitAnswer: taskAction('submitAnswer'),
      skipTask: taskAction('skipTask'),
      async answerQuiz(courseId, lessonId, index, choice, options) {
        const result = await api.answerQuiz(courseId, lessonId, index, choice, options)
        putQuiz(courseId, lessonId, index, result.saved)
        return result
      },
      async skipQuizRetry(courseId, lessonId, index) {
        const result = await api.skipQuizRetry(courseId, lessonId, index)
        putQuiz(courseId, lessonId, index, result.saved)
        return result
      },
      async resetProgress(courseId) {
        setProgress(await api.resetProgress(courseId))
        setRevealed({})
      },
    }
  }, [api, load])

  const value = useMemo(
    () => ({
      ...data,
      api,
      progress,
      actions,
      revealedOf: (courseId, taskId) => revealed[key(courseId, taskId)],
    }),
    [data, api, progress, actions, revealed],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
