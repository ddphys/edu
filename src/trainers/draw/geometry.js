// Геометрия схем тренажёра. Чистые функции без React: их проверяют тесты.
//
// Все рисунки строятся в «местных» координатах опоры:
//   x — вдоль опоры (вправо по столу, вверх по склону, вверх по стене),
//   y — от опоры вниз (тело стоит выше: у него y < 0; к опоре — к большим y).
// Рамка (frame) переводит местные координаты в координаты экрана: поворачивает склон,
// ставит стену вертикально и, если нужно, отражает рисунок зеркально (слева направо).
// Подписи рисуются в экранных координатах, поэтому при зеркале и повороте остаются прямыми.
export const W = 400
export const H = 200
// У стола рисунок ниже: над телом места нужно меньше, чем у склона и стены
export const heightOf = (surface) => (surface === 'table' ? 160 : H)

const SURFACES = {
  table: { angle: 0, origin: [200, 118], length: 300, body: { w: 78, h: 42 } },
  incline: { angle: 28, origin: [200, 112], length: 250, body: { w: 78, h: 42 } },
  wall: { angle: 90, origin: [236, 100], length: 170, body: { w: 54, h: 54 } },
}

export const bodyOf = (surface) => SURFACES[surface].body
export const lengthOf = (surface) => SURFACES[surface].length

const clean = (v) => Math.round(v * 1e6) / 1e6

// Рамка: матрица SVG (a b c d e f) и функция P(x, y) → точка на экране
export function makeFrame({ surface, angle, mirror = false }) {
  const s = SURFACES[surface]
  const rad = ((angle ?? s.angle) * Math.PI) / 180
  let [a, b, c, d, e, f] = [Math.cos(rad), -Math.sin(rad), Math.sin(rad), Math.cos(rad), s.origin[0], s.origin[1]]
  if (mirror) [a, c, e] = [-a, -c, W - e]
  ;[a, b, c, d, e, f] = [a, b, c, d, e, f].map(clean)
  return {
    matrix: [a, b, c, d, e, f],
    a,
    P: (x, y) => [clean(a * x + c * y + e), clean(b * x + d * y + f)],
    // куда на экране смотрит направление «вдоль опоры в положительную сторону»
    along: [a, b],
  }
}

const SIGN = { right: 1, up: 1, left: -1, down: -1 }
export const signOf = (dir) => SIGN[dir]

const ARROW_LEN = 56

// Стрелки схемы в местных координатах. Для каждой — отрезки (seg), стрелочная голова на конце
// последнего отрезка, цвет и подпись (место подписи — в местных координатах).
export function arrowsOf(figure, surface) {
  const { w, h } = bodyOf(surface)
  const out = []
  for (const item of figure.arrows ?? []) {
    const s = signOf(item.dir) ?? 1
    const len = item.len ?? ARROW_LEN
    const mid = -h / 2
    const dash = Boolean(item.dash)
    if (item.kind === 'v') {
      const wall = surface === 'wall'
      const cx = wall ? -18 : 0
      const l = wall ? 44 : 52
      const y = -(h + 16)
      out.push({ kind: 'v', color: 'vel', segs: [{ x1: cx - (s * l) / 2, y1: y, x2: cx + (s * l) / 2, y2: y }], label: { ...item.label, x: cx, y: y - 12 } })
    } else if (item.kind === 'F' && item.dir === 'press') {
      // Прижимающая сила: к опоре, на высоте верхней половины тела
      const x = 16
      out.push({ kind: 'F', color: 'ink', segs: [{ x1: x, y1: -(h + 70), x2: x, y2: -h }], label: { ...item.label, x: x + 16, y: -(h + 35) } })
    } else if (item.kind === 'F') {
      const pull = item.mode !== 'push'
      const [x1, x2] = pull ? [s * (w / 2), s * (w / 2 + len)] : [-s * (w / 2 + len), -s * (w / 2)]
      out.push({ kind: 'F', color: 'ink', dash, segs: [{ x1, y1: mid, x2, y2: mid, dash }], // Подпись с числом («F₁ = 5 Н») длинная — ставим её над телом, чтобы не наезжала на него
        label: { ...item.label, x: (x1 + x2) / 2, y: item.label.suffix ? -(h + 6) : mid - 13 } })
    } else if (item.kind === 'thread') {
      // Нить, натянутая под углом к опоре: тонкая линия от тела и дальше — стрелка силы
      const rad = (item.angle * Math.PI) / 180
      const ux = s * Math.cos(rad)
      const uy = -Math.sin(rad)
      const x0 = s * (w / 2)
      const y0 = -h * 0.62
      const t = 34
      const e = t + 50
      out.push({
        kind: 'F',
        color: 'ink',
        thread: { x1: x0, y1: y0, x2: x0 + ux * t, y2: y0 + uy * t },
        segs: [{ x1: x0 + ux * t, y1: y0 + uy * t, x2: x0 + ux * e, y2: y0 + uy * e }],
        label: { ...item.label, x: x0 + ux * e + s * 12, y: y0 + uy * e - 4 },
      })
    }
  }
  return out
}

// Стрелка силы трения (рисуется только в разборе): вдоль опоры у самой поверхности, выходит за край тела
export function frictionOf(dir, surface) {
  const { w } = bodyOf(surface)
  const s = signOf(dir)
  const y = -8
  const x2 = s * (w / 2 + 34)
  return { kind: 'fric', color: 'fric', segs: [{ x1: -s * 12, y1: y, x2, y2: y }], label: { main: 'F', sub: 'тр', x: x2 + s * 9, y: -2, side: s } }
}
