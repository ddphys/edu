// Экран «Проверка»: баллы по 26 заданиям и карточка итога
import { useEffect, useState } from 'react'
import { EGE } from './config.js'
import { PART1_MAX, PART2_MAX, SKIP, TASKS, TOPIC_OF, TOTAL, calc, dShort, goalOf, kindOf, okDate, primaryFor } from './calc.js'
import { cardFileName, drawCard, loadCardFonts } from './card.js'
import { ConvChart } from './charts.jsx'
import { Tween, download } from './ui.jsx'

const f = (n) => +n.toFixed(1)

function TaskRow({ n, value, onSet }) {
  const m = EGE.maxes[n - 1]
  const t = TOPIC_OF[n]
  const pts = [SKIP, ...Array.from({ length: m + 1 }, (_, x) => x)]
  return (
    <div className="e-row" data-k={kindOf(value, m)} style={{ '--tc': `var(--t-${t.id})` }}>
      <span className="e-n" title={EGE.notes[n] || t.name}>
        {n}
      </span>
      <div className="e-pts">
        {pts.map((x) =>
          x === SKIP ? (
            <button key={x} type="button" className="e-pt e-pt--skip" data-k="skip" aria-pressed={value === SKIP} aria-label={`Задание ${n}: не решал`} title="Не решал" onClick={() => onSet(n, SKIP)}>
              –
            </button>
          ) : (
            <button key={x} type="button" className="e-pt" data-k={kindOf(x, m)} aria-pressed={value === x} aria-label={`Задание ${n}: ${x} из ${m}`} onClick={() => onSet(n, x)}>
              {x}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

function Part({ title, from, to, sum, max, scores, onSet }) {
  const nums = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  return (
    <div className="e-part">
      <div className="e-ph">
        <span>{title}</span>
        <b>
          {sum} из {max}
        </b>
      </div>
      <div className="e-rows" style={{ '--r': Math.ceil(nums.length / 2) }}>
        {nums.map((n) => (
          <TaskRow key={n} n={n} value={scores[n]} onSet={onSet} />
        ))}
      </div>
    </div>
  )
}

function CardDialog({ student, exam, onClose }) {
  const [img, setImg] = useState(null)
  useEffect(() => {
    let alive = true
    loadCardFonts().then(() => {
      if (!alive) return
      const cv = drawCard(student, exam)
      cv.toBlob((blob) => alive && setImg({ url: URL.createObjectURL(blob), blob }), 'image/png')
    })
    return () => {
      alive = false
    }
  }, [student, exam])
  useEffect(() => () => img && URL.revokeObjectURL(img.url), [img])
  useEffect(() => {
    const onKey = (ev) => ev.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="e-ov" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="e-dlg" role="dialog" aria-modal="true" aria-label="Карточка для ученика">
        {img ? <img src={img.url} alt="Карточка с результатом пробника" /> : <p>Рисую карточку…</p>}
        <p>Скачай картинку и отправь ученику. На телефоне можно сохранить долгим нажатием.</p>
        <div className="e-acts">
          <button className="e-btn e-btn--pri" type="button" disabled={!img} onClick={() => download(img.blob, cardFileName(student, exam))}>
            Скачать PNG
          </button>
          <button className="e-btn" type="button" onClick={onClose} autoFocus>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CheckView({ ready, student, exam, exams, actions }) {
  const [card, setCard] = useState(false)

  if (!ready)
    return (
      <div className="e-card e-empty">
        <p>Загружаю данные…</p>
      </div>
    )
  if (!student)
    return (
      <div className="e-card e-empty">
        <h2>Добавь первого ученика</h2>
        <p>Потом создай пробник и отмечай баллы по заданиям одним нажатием.</p>
        <button className="e-btn e-btn--pri" type="button" onClick={actions.addStudent}>
          + Ученик
        </button>
      </div>
    )
  if (!exam)
    return (
      <div className="e-card e-empty">
        <h2>У ученика пока нет пробников</h2>
        <p>Создай пробник, и здесь появятся задания 1–26.</p>
        <button className="e-btn e-btn--pri" type="button" onClick={actions.newExam}>
          + Новый пробник
        </button>
      </div>
    )

  const c = calc(exam)
  const goal = goalOf(student)
  const minP = primaryFor(EGE.minTest)
  const need = primaryFor(goal)
  const fill = { width: (c.p / TOTAL) * 100 + '%' }

  return (
    <section>
      <div className="e-mini" aria-hidden="true">
        <b>
          <Tween value={c.p} />
        </b>
        <span>/{TOTAL}</span>
        <span>→</span>
        <b className="e-t">
          <Tween value={c.test} />
        </b>
        <span>/100</span>
        <div className="e-mbar">
          <i style={fill} />
        </div>
      </div>
      <div className="e-check">
        <div className="e-card">
          <div className="e-exhead">
            <label className="e-sr" htmlFor="e-exam">
              Пробник
            </label>
            <select id="e-exam" value={exam.id} onChange={(ev) => actions.selectExam(ev.target.value)}>
              {exams
                .slice()
                .reverse()
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {(e.title || 'Пробник') + (okDate(e.date) ? ' · ' + dShort(e.date) : '')}
                  </option>
                ))}
            </select>
            <button className="e-btn e-btn--ghost" type="button" onClick={actions.newExam}>
              + Пробник
            </button>
          </div>
          <div className="e-legend" aria-hidden="true">
            {EGE.topics.map((t) => (
              <span key={t.id} style={{ '--tc': `var(--t-${t.id})` }}>
                <i />
                {t.short}
              </span>
            ))}
          </div>
          <Part title="Часть 1" from={1} to={EGE.part1} sum={c.p1} max={PART1_MAX} scores={exam.scores} onSet={actions.setScore} />
          <Part title="Часть 2" from={EGE.part1 + 1} to={TASKS} sum={c.p2} max={PART2_MAX} scores={exam.scores} onSet={actions.setScore} />
        </div>

        <aside className="e-side">
          <div className="e-card e-score">
            <div className="e-sc-head">
              <b>{student.name || 'Без имени'}</b>
              <span>
                проверено {c.checked}/{TASKS}
              </span>
            </div>
            <div className="e-sc-main">
              <div className="e-tbig">
                <Tween value={c.test} />
                <small>/100</small>
              </div>
              <div className="e-prim">
                <b>
                  <Tween value={c.p} /> из {TOTAL}
                </b>
                первичных
              </div>
            </div>
            <div className="e-bar">
              <i style={fill} />
            </div>
            <div className="e-goals">
              {c.p >= minP ? (
                <span className="e-pill is-ok">порог {EGE.minTest} пройден</span>
              ) : (
                <span className="e-pill">
                  до порога {EGE.minTest}: {minP - c.p} перв.
                </span>
              )}
              {c.p >= need ? (
                <span className="e-pill is-ok">цель {goal} есть</span>
              ) : (
                <span className="e-pill">
                  до цели {goal}: {need - c.p} перв.
                </span>
              )}
              {c.lost > 0 && <span className="e-pill">потеряно {c.lost}</span>}
              {c.skipped > 0 && <span className="e-pill">не решал {c.skipped}</span>}
            </div>
            <div className="e-topics">
              {EGE.topics.map((t) => {
                const s = c.topics[t.id]
                return (
                  <div key={t.id} className="e-tp" style={{ '--tc': `var(--t-${t.id})` }}>
                    <b>{t.name}</b>
                    <span>
                      {s.got} из {s.max}
                    </span>
                    <div className="e-tb">
                      <i style={{ width: f((s.got / s.max) * 100) + '%' }} />
                      <i className="e-ls" style={{ width: f((s.lost / s.max) * 100) + '%' }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <ConvChart p={c.p} test={c.test} goal={goal} />
            <button className="e-btn e-btn--ghost e-cardbtn" type="button" onClick={() => setCard(true)}>
              Карточка для ученика
            </button>
          </div>
        </aside>
      </div>
      {card && <CardDialog student={student} exam={exam} onClose={() => setCard(false)} />}
    </section>
  )
}
