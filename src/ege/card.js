// Картинка-карточка с результатом пробника для ученика: PNG 1080×1520, рисуется на canvas.
import { EGE } from './config.js'
import { PART1_MAX, PART2_MAX, TASKS, TOPIC_OF, TOTAL, calc, dFull, kindOf, okDate, today } from './calc.js'
import { asciiName } from './data.js'

const C = { bg: '#FFFFFF', ink: '#16181D', muted: '#6B7280', faint: '#A3A9B5', line: '#E8EAEE', soft: '#F0F2F5', acc: '#3A5BD9', good: '#2F9E6B', goodS: '#E4F4EC', mid: '#D38B14', midS: '#FCF1DC', bad: '#DA4A3D', badS: '#FCE8E5' }
const F = '"Onest",system-ui,-apple-system,"Segoe UI",sans-serif'
const TOPIC_HEX = Object.fromEntries(EGE.topics.map((t) => [t.id, t.light]))

function rr(x, a, b, w, h, r) {
  x.beginPath()
  x.moveTo(a + r, b)
  x.arcTo(a + w, b, a + w, b + h, r)
  x.arcTo(a + w, b + h, a, b + h, r)
  x.arcTo(a, b + h, a, b, r)
  x.arcTo(a, b, a + w, b, r)
  x.closePath()
}

export function drawCard(st, ex) {
  const W = 1080, H = 1520, P = 72
  const MIN = EGE.minTest, CONV = EGE.scale
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const x = cv.getContext('2d')
  const c = calc(ex), goal = st.goal || EGE.defaultGoal, sc = ex.scores || {}

  x.fillStyle = C.bg
  x.fillRect(0, 0, W, H)
  x.textBaseline = 'alphabetic'
  x.fillStyle = C.faint
  x.font = '500 26px ' + F
  x.fillText('ЕГЭ по физике', P, 104)
  let size = 58
  x.fillStyle = C.ink
  do {
    x.font = '600 ' + size + 'px ' + F
    size -= 2
  } while (x.measureText(st.name || '').width > W - 2 * P && size > 28)
  x.fillText(st.name || '', P, 172)
  x.fillStyle = C.muted
  x.font = '400 28px ' + F
  x.fillText((ex.title || 'Пробник') + (okDate(ex.date) ? ' · ' + dFull(ex.date) : ''), P, 218)

  // крупный балл
  x.fillStyle = C.acc
  x.font = '600 200px ' + F
  const tw = x.measureText(String(c.test)).width
  x.fillText(String(c.test), P - 8, 440)
  x.fillStyle = C.faint
  x.font = '500 44px ' + F
  x.fillText('/100', P + tw, 440)
  x.textAlign = 'right'
  x.fillStyle = C.ink
  x.font = '600 56px ' + F
  x.fillText(c.p + ' из ' + TOTAL, W - P, 400)
  x.fillStyle = C.muted
  x.font = '400 28px ' + F
  x.fillText('первичных баллов', W - P, 440)
  x.textAlign = 'left'
  rr(x, P, 480, W - 2 * P, 12, 6)
  x.fillStyle = C.soft
  x.fill()
  if (c.p) {
    rr(x, P, 480, Math.max(12, ((W - 2 * P) * c.p) / TOTAL), 12, 6)
    x.fillStyle = C.acc
    x.fill()
  }
  x.fillStyle = C.muted
  x.font = '400 26px ' + F
  x.fillText('Часть 1: ' + c.p1 + ' из ' + PART1_MAX + '   ·   Часть 2: ' + c.p2 + ' из ' + PART2_MAX, P, 546)

  // клетки заданий
  const g = 10, cols = Math.ceil(TASKS / 2), tw2 = (W - 2 * P - (cols - 1) * g) / cols
  EGE.maxes.forEach((m, i) => {
    const v = sc[i + 1], tx = P + (i % cols) * (tw2 + g), ty = 580 + Math.floor(i / cols) * (104 + g)
    const k = kindOf(v, m)
    let bg = C.soft, fg = C.faint
    if (k === 'full') (bg = C.goodS), (fg = C.good)
    else if (k === 'mid') (bg = C.midS), (fg = C.mid)
    else if (k === 'zero') (bg = C.badS), (fg = C.bad)
    rr(x, tx, ty, tw2, 104, 12)
    x.fillStyle = bg
    x.fill()
    rr(x, tx + 14, ty + 9, tw2 - 28, 5, 2.5)
    x.fillStyle = TOPIC_HEX[TOPIC_OF[i + 1].id]
    x.fill()
    x.textAlign = 'center'
    x.fillStyle = C.muted
    x.font = '500 18px ' + F
    x.fillText(String(i + 1), tx + tw2 / 2, ty + 40)
    x.fillStyle = fg
    if (v == null) {
      x.font = '600 34px ' + F
      x.fillText('·', tx + tw2 / 2, ty + 84)
    } else if (k === 'skip') {
      x.fillStyle = C.muted
      x.font = '500 22px ' + F
      x.fillText('н/р', tx + tw2 / 2, ty + 82)
    } else {
      x.font = '600 32px ' + F
      x.fillText(v + '/' + m, tx + tw2 / 2, ty + 84)
    }
    x.textAlign = 'left'
  })

  // по темам
  x.fillStyle = C.faint
  x.font = '500 24px ' + F
  x.fillText('По темам', P, 856)
  const cw = (W - 2 * P - 48) / 2
  EGE.topics.forEach((t, i) => {
    const s = c.topics[t.id], cx = P + (i % 2) * (cw + 48), cy = 904 + Math.floor(i / 2) * 72
    x.fillStyle = C.ink
    x.font = '500 26px ' + F
    x.fillText(t.name, cx, cy)
    x.textAlign = 'right'
    x.fillStyle = C.muted
    x.font = '400 24px ' + F
    x.fillText(s.got + ' из ' + s.max, cx + cw, cy)
    x.textAlign = 'left'
    rr(x, cx, cy + 14, cw, 10, 5)
    x.fillStyle = C.soft
    x.fill()
    if (s.got) {
      rr(x, cx, cy + 14, Math.max(10, (cw * s.got) / s.max), 10, 5)
      x.fillStyle = TOPIC_HEX[t.id]
      x.fill()
    }
  })

  // график перевода
  const top = 1150, bot = 1390, l = P, r = W - P - 90
  const X = (p) => l + (p / TOTAL) * (r - l), Y = (t) => bot - (t / 100) * (bot - top)
  x.fillStyle = C.faint
  x.font = '500 24px ' + F
  x.fillText('Перевод первичных баллов в тестовые', P, 1116)
  x.strokeStyle = C.line
  x.lineWidth = 2
  x.beginPath()
  x.moveTo(l, bot)
  x.lineTo(r, bot)
  x.stroke()
  x.fillStyle = C.faint
  x.font = '400 22px ' + F
  for (const t of [0, 15, 30, 45]) {
    x.textAlign = t === 0 ? 'left' : t === 45 ? 'right' : 'center'
    x.fillText(String(t), X(t), bot + 36)
  }
  x.textAlign = 'left'
  x.setLineDash([6, 8])
  x.lineWidth = 2
  x.strokeStyle = 'rgba(218,74,61,.6)'
  x.beginPath()
  x.moveTo(l, Y(MIN))
  x.lineTo(r, Y(MIN))
  x.stroke()
  x.strokeStyle = 'rgba(47,158,107,.75)'
  x.beginPath()
  x.moveTo(l, Y(goal))
  x.lineTo(r, Y(goal))
  x.stroke()
  x.setLineDash([])
  x.font = '500 22px ' + F
  x.fillStyle = C.bad
  x.fillText(String(MIN), r + 14, Y(MIN) + 8)
  x.fillStyle = C.good
  x.fillText('цель ' + goal, r + 14, Y(goal) + 8)
  x.strokeStyle = 'rgba(58,91,217,.25)'
  x.lineWidth = 3
  x.lineJoin = 'round'
  x.beginPath()
  for (let p = 0; p <= TOTAL; p++) p ? x.lineTo(X(p), Y(CONV[p])) : x.moveTo(X(p), Y(CONV[p]))
  x.stroke()
  if (c.p) {
    x.fillStyle = 'rgba(58,91,217,.1)'
    x.beginPath()
    x.moveTo(X(0), Y(0))
    for (let p = 0; p <= c.p; p++) x.lineTo(X(p), Y(CONV[p]))
    x.lineTo(X(c.p), Y(0))
    x.closePath()
    x.fill()
    x.strokeStyle = C.acc
    x.lineWidth = 5
    x.beginPath()
    for (let p = 0; p <= c.p; p++) p ? x.lineTo(X(p), Y(CONV[p])) : x.moveTo(X(p), Y(CONV[p]))
    x.stroke()
  }
  const mx = X(c.p), my = Y(c.test)
  x.beginPath()
  x.arc(mx, my, 12, 0, Math.PI * 2)
  x.fillStyle = C.acc
  x.fill()
  x.lineWidth = 6
  x.strokeStyle = C.bg
  x.stroke()
  const right = mx > (l + r) * 0.6
  x.textAlign = right ? 'right' : 'left'
  x.fillStyle = C.ink
  x.font = '600 30px ' + F
  x.fillText(c.p + ' → ' + c.test, right ? mx - 22 : mx + 22, my - 18)
  x.textAlign = 'left'
  x.fillStyle = C.faint
  x.font = '400 22px ' + F
  x.fillText('Проверено ' + c.checked + ' из ' + TASKS + ' заданий' + (c.skipped ? ' · не решал ' + c.skipped : ''), P, H - 48)
  return cv
}

// Перед рисованием нужно дождаться шрифта, иначе canvas возьмёт запасной
export async function loadCardFonts() {
  try {
    await Promise.all(['400 20px "Onest"', '500 20px "Onest"', '600 40px "Onest"'].map((s) => document.fonts.load(s, 'Аб0')))
  } catch {
    /* без Onest карточка нарисуется системным шрифтом */
  }
}

export const cardFileName = (st, ex) => asciiName(`Результат ${st.name || 'ученик'} ${ex.date || today()}`.replace(/[\\/:*?"<>|]+/g, '').trim() + '.png')
