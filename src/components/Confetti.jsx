import { useEffect, useRef } from 'react'

// Салют из цветных бумажек поверх страницы — когда ученик решил последнюю задачу урока.
// Два залпа из нижних углов, бумажки летят к середине и падают. Сам убирается через три секунды.
// Если на устройстве отключены анимации, салюта нет.
const COLORS = ['#2f54eb', '#08824a', '#ffc83d', '#ff5a5f', '#8fb0ff', '#3fcf8e']
const SECONDS = 3.2

export default function Confetti({ onDone }) {
  const ref = useRef(null)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return done.current?.()
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * ratio
    canvas.height = H * ratio
    ctx.scale(ratio, ratio)

    const count = Math.min(220, 90 + Math.round(W / 8))
    const power = Math.sqrt(H) * 46
    const parts = Array.from({ length: count }, (_, i) => {
      const left = i % 2 === 0
      // Угол вылета: вверх и к середине экрана
      const angle = (left ? -Math.PI / 2 + 0.2 : -Math.PI / 2 - 0.2) + (Math.random() - 0.5) * 1.1
      const speed = power * (0.55 + Math.random() * 0.6)
      return {
        x: left ? -10 : W + 10,
        y: H * 0.92,
        vx: Math.cos(angle) * speed * (left ? 1 : 1),
        vy: Math.sin(angle) * speed,
        w: 6 + Math.random() * 8,
        h: 8 + Math.random() * 10,
        turn: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 14,
        sway: Math.random() * Math.PI * 2,
        color: COLORS[i % COLORS.length],
        round: i % 5 === 0,
        delay: Math.random() * 0.25,
      }
    })

    let frame
    let last = performance.now()
    const start = last
    const tick = (now) => {
      const dt = Math.min(0.04, (now - last) / 1000)
      last = now
      const t = (now - start) / 1000
      ctx.clearRect(0, 0, W, H)
      ctx.globalAlpha = Math.min(1, (SECONDS - t) / 0.7)
      for (const p of parts) {
        if (t < p.delay) continue
        p.vy += 1500 * dt
        p.vx *= 1 - 1.6 * dt
        p.vy *= 1 - 1.1 * dt
        p.x += (p.vx + Math.sin(t * 3 + p.sway) * 40) * dt
        p.y += p.vy * dt
        p.turn += p.spin * dt
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.turn)
        ctx.scale(1, Math.cos(t * 6 + p.sway))
        ctx.fillStyle = p.color
        if (p.round) {
          ctx.beginPath()
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
          ctx.fill()
        } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      if (t < SECONDS) frame = requestAnimationFrame(tick)
      else done.current?.()
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={ref} className="confetti" aria-hidden="true" />
}
