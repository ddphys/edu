// Минималистичные графики бланка: без сетки и лишних осей.
import { EGE } from './config.js'
import { TOTAL, calc, dShort } from './calc.js'

const f = (n) => +n.toFixed(1)

// Кривая перевода первичных в тестовые: пройденный участок выделен, пунктиры порога и цели, точка «14 → 48»
export function ConvChart({ p, test, goal }) {
  const W = 320, H = 168, L = 4, R = 62, T = 14, B = 20
  const CONV = EGE.scale, MIN = EGE.minTest
  const X = (v) => L + (v / TOTAL) * (W - L - R)
  const Y = (t) => H - B - (t / 100) * (H - T - B)
  let all = '', cur = '', area = `M${X(0)} ${Y(0)}`
  for (let i = 0; i <= TOTAL; i++) all += `${i ? 'L' : 'M'}${f(X(i))} ${f(Y(CONV[i]))}`
  for (let i = 0; i <= p; i++) {
    cur += `${i ? 'L' : 'M'}${f(X(i))} ${f(Y(CONV[i]))}`
    area += `L${f(X(i))} ${f(Y(CONV[i]))}`
  }
  area += `L${f(X(p))} ${f(Y(0))}Z`
  const mx = X(p), my = Y(test), right = mx > (W - R) * 0.7
  return (
    <svg className="e-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Перевод баллов: ${p} первичных это ${test} тестовых`}>
      <line className="e-base" x1={L} x2={W - R} y1={H - B} y2={H - B} />
      {[0, 15, 30, 45].map((t) => (
        <text key={t} className="e-tk" x={f(X(t))} y={H - 4} textAnchor={t === 0 ? 'start' : t === 45 ? 'end' : 'middle'}>
          {t}
        </text>
      ))}
      <line className="e-lmin" x1={L} x2={W - R} y1={f(Y(MIN))} y2={f(Y(MIN))} />
      <text className="e-tmin" x={W - R + 6} y={f(Y(MIN) + 4)}>
        {MIN}
      </text>
      <line className="e-lgoal" x1={L} x2={W - R} y1={f(Y(goal))} y2={f(Y(goal))} />
      <text className="e-tgoal" x={W - R + 6} y={f(Y(goal) + 4)}>
        цель {goal}
      </text>
      <path className="e-cur-all" d={all} />
      {p > 0 && (
        <>
          <path className="e-area" d={area} />
          <path className="e-cur" d={cur} />
        </>
      )}
      <circle className="e-mk" cx={f(mx)} cy={f(my)} r="5.5" />
      <text className="e-ml" x={f(right ? mx - 10 : mx + 10)} y={f(my - 8)} textAnchor={right ? 'end' : 'start'}>
        {p} → {test}
      </text>
    </svg>
  )
}

// Тестовый балл по пробникам. Клик по точке открывает пробник.
export function HistoryChart({ exams, goal, selectedId, onPick }) {
  const W = 640, H = 200, L = 4, R = 56, T = 22, B = 24
  const MIN = EGE.minTest
  const Y = (t) => H - B - (t / 100) * (H - T - B)
  const pts = exams.map((e) => ({ e, c: calc(e) })).filter((x) => x.c.checked > 0)
  const n = pts.length, x0 = L + 20, x1 = W - R - 20
  const X = (i) => (n === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1))
  const d = pts.map((pt, i) => `${i ? 'L' : 'M'}${f(X(i))} ${f(Y(pt.c.test))}`).join('')
  return (
    <svg className="e-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Динамика тестового балла">
      <line className="e-base" x1={L} x2={W - R} y1={H - B} y2={H - B} />
      <line className="e-lmin" x1={L} x2={W - R} y1={f(Y(MIN))} y2={f(Y(MIN))} />
      <text className="e-tmin" x={W - R + 8} y={f(Y(MIN) + 4)}>
        {MIN}
      </text>
      <line className="e-lgoal" x1={L} x2={W - R} y1={f(Y(goal))} y2={f(Y(goal))} />
      <text className="e-tgoal" x={W - R + 8} y={f(Y(goal) + 4)}>
        цель {goal}
      </text>
      {!n ? (
        <text className="e-tk" x={f((W - R) / 2)} y={f(Y(60))} textAnchor="middle">
          Точки появятся после первой проверки
        </text>
      ) : (
        <>
          <path className="e-cur" d={d} />
          {pts.map(({ e, c }, i) => {
            const cx = f(X(i)), cy = f(Y(c.test))
            return (
              <g key={e.id}>
                <circle className={'e-hp' + (e.id === selectedId ? ' is-sel' : '')} cx={cx} cy={cy} r="5" />
                <text className="e-hv" x={cx} y={f(cy - 12)} textAnchor="middle">
                  {c.test}
                </text>
                {(n <= 10 || i % 2 === 0 || i === n - 1) && (
                  <text className="e-tk" x={cx} y={H - 6} textAnchor="middle">
                    {dShort(e.date)}
                  </text>
                )}
                <circle className="e-hit" cx={cx} cy={cy} r="16" onClick={() => onPick(e.id)}>
                  <title>{`${e.title || 'Пробник'}: ${c.test}`}</title>
                </circle>
              </g>
            )
          })}
        </>
      )}
    </svg>
  )
}
