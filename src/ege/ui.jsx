// Мелкие общие детали интерфейса бланка
import { useEffect, useRef, useState } from 'react'

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Число плавно «докручивается» до нового значения за 240 мс
export function Tween({ value }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current
    from.current = value
    if (start === value || reduceMotion()) {
      setShown(value)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 240)
      setShown(Math.round(start + (value - start) * k))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return shown
}

// Кнопка удаления с подтверждением вторым нажатием. Через 4 секунды без нажатия возвращается обратно.
export function ArmButton({ label = 'Удалить', confirmLabel, onConfirm }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={'e-btn e-btn--danger' + (armed ? ' is-armed' : '')}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 1500)
}

// Шрифт Onest подключается только на странице бланка
export function useOnestFont() {
  useEffect(() => {
    const id = 'ege-font-onest'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap'
    document.head.append(link)
  }, [])
}
