// Тренировка: серия из 10 заданий уровня. Задание — два шага: тип трения, потом направление.
// Верно засчитывается, только если оба шага верны с первой попытки. После ошибки — карточка разбора.
import { useEffect, useRef, useState } from 'react'
import { href } from '../../routes.js'
import { useStore } from '../../store.jsx'
import MathText from '../../components/Math.jsx'
import { current, stats } from '../engine.js'
import Scene from '../draw/Scene.jsx'
import { TYPES, checkDir, checkType, dirOptions, explainSteps, instanceOf, needsDirection, reviewHeading } from './instance.js'
import { newSeries, nextSeries } from './series.js'

const COURSE = 'trainer-friction'

const optionClass = (code, correct, picked) => {
  if (picked === undefined) return ''
  if (code === correct) return ' is-ok'
  return code === picked ? ' is-bad' : ' is-lock'
}

function Options({ items, correct, picked, disabled, onPick }) {
  return (
    <div className="tr-opts">
      {items.map((o, i) => (
        <button key={o.code} type="button" className={`tr-opt${optionClass(o.code, correct, picked)}`} disabled={disabled} onClick={() => onPick(o.code)}>
          <span className="tr-opt__k" aria-hidden="true">
            {i + 1}
          </span>
          <span className="tr-opt__t">
            {o.icon && o.iconFirst && <span className="tr-opt__i">{o.icon}</span>}
            {o.label}
            {o.icon && !o.iconFirst && <span className="tr-opt__i tr-opt__i--after">{o.icon}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

// Одно задание. Когда ученик нажал «Дальше», вызывает onNext(верно ли с первой попытки)
function Task({ inst, onNext, api }) {
  // step: type → dir → done; type и dir — выбор ученика
  const [step, setStep] = useState('type')
  const [type, setType] = useState(undefined)
  const [dir, setDir] = useState(undefined)
  const [ok, setOk] = useState(null)
  const [review, setReview] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const since = useRef(Date.now())
  const sheet = useRef(null)

  const finish = (good, input) => {
    setStep('done')
    setOk(good)
    setReview(!good)
    api.logAttempt({ course: COURSE, task: inst.id, kind: good ? 'correct' : 'wrong', input, ms: Date.now() - since.current })
  }
  const pickType = (code) => {
    setType(code)
    if (!checkType(inst, code)) finish(false, [code])
    else if (needsDirection(code)) setStep('dir')
    else finish(true, [code])
  }
  const pickDir = (code) => {
    setDir(code)
    finish(checkDir(inst, code), [type, code])
  }

  // Клавиши 1–4 выбирают вариант ответа
  const keyHandler = useRef(null)
  keyHandler.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const n = Number(e.key)
    if (step === 'type' && n >= 1 && n <= TYPES.length) pickType(TYPES[n - 1].code)
    if (step === 'dir' && n >= 1 && n <= 2) pickDir(dirOptions(inst)[n - 1].code)
  }
  useEffect(() => {
    const on = (e) => keyHandler.current(e)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  // Карточка разбора появляется под вариантами — прокручиваем к ней
  useEffect(() => {
    if (step === 'done') sheet.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [step])

  const dirChosen = dir !== undefined
  // Какой шаг показан: после ошибки на шаге 1 остаётся он, иначе — тот, на котором закончили
  const shown = step === 'type' ? 'type' : step === 'dir' ? 'dir' : dirChosen ? 'dir' : 'type'
  const frictionDir = review && needsDirection(inst.type) ? { dir: inst.dir } : null

  return (
    <>
      <section className="tr-card tr-task" data-task={inst.id} data-mirror={inst.mirror ? 1 : 0} data-variant={inst.variant}>
        <span className="tr-tag">Сила трения</span>
        <MathText className="tr-cond" text={inst.text} />
        <div className="tr-fig">
          <Scene figure={inst.figure} surface={inst.surface} angle={inst.angle} mirror={inst.mirror} friction={frictionDir} label={inst.text.replaceAll('$', '')} />
        </div>
        <p className="tr-ask">{inst.ask}</p>
      </section>

      <div className="tr-q">
        <small>{shown === 'type' ? 'Шаг 1 из 2' : 'Шаг 2 из 2'}</small>
        <h2>{shown === 'type' ? 'Какое это трение?' : 'Куда направлено?'}</h2>
      </div>
      {shown === 'type' ? (
        <Options items={TYPES.map((t) => ({ code: t.code, label: t.label }))} correct={step === 'done' ? inst.type : undefined} picked={step === 'done' ? type : undefined} disabled={step !== 'type'} onPick={pickType} />
      ) : (
        <Options items={dirOptions(inst)} correct={step === 'done' ? inst.dir : undefined} picked={step === 'done' ? dir : undefined} disabled={step !== 'dir'} onPick={pickDir} />
      )}

      {step === 'done' && (
        <section ref={sheet} className={`tr-sheet ${ok ? 'tr-sheet--ok' : 'tr-sheet--bad'}`} aria-live="polite">
          <h3>{ok ? (review ? reviewHeading(inst, { ok: true }) : 'Верно') : reviewHeading(inst, { ok: false, stage: dirChosen ? 'dir' : 'type' })}</h3>
          {review && <MathText className="tr-why" text={inst.why} />}
          {review && (ok || showSteps) && (
            <ol className="tr-steps">
              {explainSteps(inst).map((s, i) => (
                <li key={i}>
                  <MathText text={s} />
                </li>
              ))}
            </ol>
          )}
          <div className="tr-row">
            {ok ? (
              <button type="button" className="tr-btn" aria-expanded={review} onClick={() => setReview((v) => !v)}>
                {review ? 'Скрыть разбор' : 'Показать разбор'}
              </button>
            ) : (
              <button type="button" className="tr-btn" aria-expanded={showSteps} onClick={() => setShowSteps((v) => !v)}>
                Не понял
              </button>
            )}
            <button type="button" className="tr-btn tr-btn--pri" onClick={() => onNext(ok)} autoFocus>
              {ok ? 'Дальше' : 'Понял, дальше'}
            </button>
          </div>
        </section>
      )}
    </>
  )
}

function Bar({ level, series }) {
  const { total, answered, correct } = stats(series)
  return (
    <div className="tr-bar">
      <a className="tr-x" href={href.trainer('friction')} aria-label="К уровням" title="К уровням">
        ✕
      </a>
      <div className="tr-prog" role="progressbar" aria-label={`Серия, уровень ${level}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}>
        <i style={{ width: `${(answered / total) * 100}%` }} />
      </div>
      <span className="tr-score" aria-label={`Верно ${correct} из ${answered}`}>
        <b>✓ {correct}</b> из {answered}
      </span>
    </div>
  )
}

function Summary({ series, onAgain }) {
  const { total, correct } = stats(series)
  return (
    <section className="tr-card tr-sum">
      <span className="tr-tag">Серия пройдена</span>
      <div className="tr-sum__score">
        <b>✓ {correct}</b> из {total}
      </div>
      <p className="tr-sum__text">{correct === total ? 'Все задания верно с первой попытки.' : `Верно с первой попытки: ${correct} из ${total}. Ошибки разобраны по ходу серии.`}</p>
      <div className="tr-row tr-row--col">
        <button type="button" className="tr-btn tr-btn--pri" onClick={onAgain} autoFocus>
          Ещё серия
        </button>
        <a className="tr-btn tr-btn--link" href={href.trainer('friction')}>
          К уровням
        </a>
      </div>
    </section>
  )
}

export default function Play({ level }) {
  const { api } = useStore()
  const [series, setSeries] = useState(() => newSeries(level))
  const [run, setRun] = useState(0)
  // Пока открыта серия одного уровня, при смене уровня в адресе начинаем заново
  const [forLevel, setForLevel] = useState(level)
  if (forLevel !== level) {
    setForLevel(level)
    setSeries(newSeries(level))
    setRun((r) => r + 1)
  }

  const slot = current(series)
  const { finished } = stats(series)
  return (
    <div className="tr tr-play">
      <Bar level={level} series={series} />
      {finished ? (
        <Summary
          series={series}
          onAgain={() => {
            setSeries(newSeries(level))
            setRun((r) => r + 1)
          }}
        />
      ) : (
        <Task key={`${run}/${series.pos}`} inst={instanceOf(slot)} api={api} onNext={(ok) => setSeries((s) => nextSeries(level, s, ok))} />
      )}
    </div>
  )
}
