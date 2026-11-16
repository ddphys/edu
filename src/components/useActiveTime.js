import { useCallback, useEffect, useRef } from 'react'

// Сколько времени блок был у ученика перед глазами: вкладка открыта и блок виден на экране.
// Возвращает функцию take(): отдаёт накопленные миллисекунды и начинает счёт заново.
// Это оценка «сколько думал над задачей» для журнала попыток, а не точный секундомер:
// ученик мог решать на бумаге или отойти от экрана.
export function useActiveTime(ref, enabled = true) {
  const total = useRef(0)
  const since = useRef(null) // когда блок стал виден; null — сейчас не виден

  const flush = useCallback(() => {
    if (since.current === null) return
    const now = performance.now()
    total.current += now - since.current
    since.current = now
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof IntersectionObserver !== 'function') return
    let onScreen = false
    const update = () => {
      const active = onScreen && document.visibilityState === 'visible'
      if (active && since.current === null) since.current = performance.now()
      if (!active && since.current !== null) {
        flush()
        since.current = null
      }
    }
    // Виден — значит на экране хотя бы половина блока или блок занимает половину экрана
    const io = new IntersectionObserver(
      ([entry]) => {
        const seen = entry.intersectionRect.height
        onScreen = entry.isIntersecting && seen >= Math.min(entry.boundingClientRect.height, window.innerHeight) / 2
        update()
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    io.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', update)
      flush()
      since.current = null
    }
  }, [ref, enabled, flush])

  return useCallback(() => {
    flush()
    const ms = Math.round(total.current)
    total.current = 0
    return ms
  }, [flush])
}
