// Рисовалка схем тренажёра: стол, склон, стена, брусок и стрелки сил.
// Принимает описание схемы (figure из ситуации) и рисует SVG. Цвета берёт из переменных
// --tr-* (см. trainers.css), поэтому в обеих темах рисунок читается без правок.
import { useId } from 'react'
import { W, arrowsOf, bodyOf, frictionOf, heightOf, lengthOf, makeFrame } from './geometry.js'

const COLORS = { ink: 'var(--tr-ink)', vel: 'var(--tr-vel)', fric: 'var(--tr-fric)' }
const HEAD = 10
const HALF = 4.6

function Arrow({ x1, y1, x2, y2, color, width = 2.4, dash = false, cls }) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const bx = x2 - ux * HEAD
  const by = y2 - uy * HEAD
  return (
    <g className={cls}>
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash ? '6 5' : undefined} />
      <path d={`M${x2} ${y2} L${bx - uy * HALF} ${by + ux * HALF} L${bx + uy * HALF} ${by - ux * HALF}Z`} fill={color} />
    </g>
  )
}

// Подпись силы или скорости: буква курсивом (STIX), над ней чёрточка вектора, индекс и «= 5 Н» после неё.
// x, y — где поставить подпись; anchor: middle (по центру), start (слева от точки), end (справа от точки)
function Label({ main, sub, suffix, x, y, color, anchor = 'middle' }) {
  const width = 10 + (sub ? 3 + sub.length * 6 : 0) + (suffix ? suffix.length * 7 : 0)
  const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x
  return (
    <g className="tr-lab-g">
      <line x1={x0 + 1} y1={y - 14} x2={x0 + 11} y2={y - 14} stroke={color} strokeWidth="1.1" />
      <text x={x0} y={y} fill={color} className="tr-lab">
        <tspan className="tr-lab__main">{main}</tspan>
        {sub && (
          <tspan className="tr-lab__sub" dy="4">
            {sub}
          </tspan>
        )}
        {suffix && (
          <tspan className="tr-lab__suf" dy={sub ? -4 : 0}>
            {suffix}
          </tspan>
        )}
      </text>
    </g>
  )
}

function Item({ item, frame, cls }) {
  const color = COLORS[item.color]
  const { P } = frame
  const label = item.label
  let anchor = 'middle'
  if (label.side) {
    // Подпись силы трения стоит за остриём стрелки: слева или справа от него на экране
    const dx = label.side * frame.a
    anchor = Math.abs(frame.a) < 0.3 ? 'middle' : dx > 0 ? 'start' : 'end'
  }
  const [lx, ly] = P(label.x, label.y)
  return (
    <g className={cls}>
      {item.thread && <line {...lineProps(P, item.thread)} stroke={color} strokeWidth="1.6" strokeLinecap="round" />}
      {item.segs.map((seg, i) => {
        const [x1, y1] = P(seg.x1, seg.y1)
        const [x2, y2] = P(seg.x2, seg.y2)
        return <Arrow key={i} x1={x1} y1={y1} x2={x2} y2={y2} color={color} dash={seg.dash} width={item.kind === 'fric' ? 2.8 : 2.4} />
      })}
      <Label main={label.main} sub={label.sub} suffix={label.suffix} x={lx} y={ly} color={color} anchor={anchor} />
    </g>
  )
}

function lineProps(P, seg) {
  const [x1, y1] = P(seg.x1, seg.y1)
  const [x2, y2] = P(seg.x2, seg.y2)
  return { x1, y1, x2, y2 }
}

// figure — описание схемы; surface — table | incline | wall; angle — угол склона (для incline);
// mirror — отразить зеркально; friction — { dir } рисует стрелку трения (в разборе); label — подпись для скринридера
export default function Scene({ figure, surface, angle, mirror = false, friction = null, label }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const frame = makeFrame({ surface, angle, mirror })
  const { P, matrix } = frame
  const { w, h } = bodyOf(surface)
  const L = lengthOf(surface)
  const items = arrowsOf(figure, surface)
  const m = `matrix(${matrix.join(' ')})`

  let ground
  if (surface === 'incline') {
    const a = P(-L / 2, 0)
    const b = P(L / 2, 0)
    const [low, high] = a[1] > b[1] ? [a, b] : [b, a]
    ground = (
      <g>
        <polygon points={`${low[0]},${low[1]} ${high[0]},${high[1]} ${high[0]},${low[1]}`} fill={`url(#hatch${id})`} stroke="var(--tr-ink)" strokeWidth="1.4" strokeLinejoin="round" />
      </g>
    )
  } else {
    ground = (
      <g transform={m}>
        <rect x={-L / 2} y="0" width={L} height="12" fill={`url(#hatch${id})`} />
        <line x1={-L / 2} y1="0" x2={L / 2} y2="0" stroke="var(--tr-ink)" strokeWidth="1.4" />
      </g>
    )
  }
  const [mx, my] = P(0, -h / 2 + 5)

  return (
    <svg className="tr-scene" viewBox={`0 0 ${W} ${heightOf(surface)}`} role="img" aria-label={label ?? 'Схема'}>
      <defs>
        <pattern id={`hatch${id}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--tr-ink)" strokeOpacity=".45" strokeWidth="1" />
        </pattern>
      </defs>
      {ground}
      <g transform={m}>
        <rect x={-w / 2} y={-h} width={w} height={h} rx="8" fill="var(--tr-body)" stroke="var(--tr-hl)" strokeWidth="3" />
      </g>
      <text x={mx} y={my} textAnchor="middle" className="tr-lab tr-lab__main tr-lab--body">
        m
      </text>
      {items.map((item, i) => (
        <Item key={i} item={item} frame={frame} />
      ))}
      {friction && <Item item={frictionOf(friction.dir, surface)} frame={frame} cls="tr-fric" />}
    </svg>
  )
}
