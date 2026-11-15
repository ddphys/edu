import { useEffect, useState } from 'react'
import MathText from './Math.jsx'
import {
  answerInputMode,
  calcXp,
  cooldownAfter,
  errorCost,
  errorsOf,
  getParts,
  hintCost,
  isCorrect,
  minXp,
  parseNumber,
  plural,
  taskMaxXp,
} from '../lib.js'

const fmt = (n) => String(n).replace('.', ',')

// «20 − 5 за подсказку − 8 за 2 ошибки» — откуда взялось итоговое XP
function xpBreakdown(task, hints, errors, xp) {
  if (!hints && !errors) return 'Без ошибок и подсказок — максимум'
  const items = [`${taskMaxXp(task)}`]
  if (hints) items.push(`− ${hints * hintCost(task)} за ${hints > 1 ? hints + ' ' : ''}${plural(hints, 'подсказку', 'подсказки', 'подсказок')}`)
  if (errors) items.push(`− ${errors * errorCost(task)} за ${errors > 1 ? errors + ' ' : ''}${plural(errors, 'ошибку', 'ошибки', 'ошибок')}`)
  let line = items.join(' ')
  if (xp === minXp(task) && taskMaxXp(task) - hints * hintCost(task) - errors * errorCost(task) < xp)
    line += ` · но не меньше ${xp} XP, раз решили сами`
  return line
}

export default function Task({ task, index, state, onChange, onNext, hasNext }) {
  const parts = getParts(task)
  const hints = task.hints ?? []
  const multi = parts.length > 1
  const { status, hintsUsed } = state
  const errors = errorsOf(state)
  const okParts = state.okParts || []
  const done = status !== 'pending'

  // Что сейчас введено в полях (для решённых полей — их верный ответ)
  const [inputs, setInputs] = useState(() => parts.map(() => ''))
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [message, setMessage] = useState('')
  const [delta, setDelta] = useState(null) // всплывающее «−4» у плашки XP

  // Пауза от перебора: тикаем раз в секунду, пока она идёт
  const [now, setNow] = useState(Date.now)
  const lockLeft = Math.max(0, Math.ceil(((state.lockUntil || 0) - now) / 1000))
  useEffect(() => {
    if (!state.lockUntil || state.lockUntil <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [state.lockUntil])

  const potential = calcXp(task, hintsUsed, errors)
  const showDelta = (before, after) => {
    if (after < before) setDelta({ value: before - after, key: Date.now() })
  }

  // В старых сохранениях ответ лежал одной строкой в state.answer
  const savedAnswer = (i) => state.answers?.[i] ?? (i === 0 ? state.answer : '') ?? ''
  const shownValue = (i) => (done ? savedAnswer(i) : okParts[i] ? fmt(parts[i].answer) : inputs[i])

  function useHint() {
    if (hintsUsed >= hints.length) return
    showDelta(potential, calcXp(task, hintsUsed + 1, errors))
    onChange({ ...state, hintsUsed: hintsUsed + 1 })
  }

  function submit(e) {
    e.preventDefault()
    if (lockLeft > 0) return
    const open = parts.map((_, i) => i).filter((i) => !okParts[i])
    if (open.some((i) => !inputs[i].trim())) return setMessage(multi ? 'Заполните все поля ответа' : 'Введите ответ')
    // Не число — это опечатка, а не ошибка в решении: XP не снимаем
    if (open.some((i) => parseNumber(inputs[i]) === null))
      return setMessage('Ответ должен быть числом, например 12, −6 или 2,5 — без единиц измерения. XP за это не снимается.')

    const nowOk = parts.map((p, i) => okParts[i] || isCorrect(p, inputs[i]))
    const answers = parts.map((p, i) => (nowOk[i] ? fmt(p.answer) : inputs[i]))

    if (nowOk.every(Boolean)) {
      onChange({ ...state, status: 'correct', errors, answers, okParts: nowOk, xp: potential, lockUntil: 0 })
      setMessage('')
      return
    }

    // Ошибка: одна на отправку, сколько бы полей ни было неверно
    const nextErrors = errors + 1
    const next = calcXp(task, hintsUsed, nextErrors)
    const pause = cooldownAfter(nextErrors)
    onChange({ ...state, errors: nextErrors, okParts: nowOk, lockUntil: pause ? Date.now() + pause : 0 })
    setNow(Date.now())
    showDelta(potential, next)
    const wrongCount = nowOk.filter((v) => !v).length
    const what = multi ? `Неверных ответов: ${wrongCount}` : 'Неверно'
    setMessage(next < potential ? `${what}, −${potential - next} XP. Попробуйте ещё раз.` : `${what}. Попробуйте ещё раз.`)
    setInputs(parts.map(() => ''))
  }

  function skip() {
    // Уже решённые поля остаются с верным ответом
    const answers = parts.map((p, i) => (okParts[i] ? fmt(p.answer) : ''))
    onChange({ ...state, status: 'skipped', answers, xp: 0, lockUntil: 0 })
    setConfirmSkip(false)
    setMessage('')
  }

  const cls = (i) => (done ? (okParts[i] ? 'ok' : 'bad') : okParts[i] ? 'ok' : '')
  const shownHints = hints.slice(0, hintsUsed)
  const hintsLeft = hintsUsed < hints.length
  const nextHintCost = potential - calcXp(task, hintsUsed + 1, errors)
  const nudge = errors > 0 && hintsLeft

  return (
    <div className="task">
      <div className="task__head">
        <span>Задача {index + 1}</span>
        {!done && (
          <span className="xp-pill" title={`Максимум за задачу — ${taskMaxXp(task)} XP`}>
            {potential} XP
            {delta && (
              <span className="xp-pill__delta" key={delta.key} onAnimationEnd={() => setDelta(null)}>
                −{delta.value}
              </span>
            )}
          </span>
        )}
      </div>
      <h3 className="task__title">{task.title}</h3>
      <MathText text={task.text} className="task__text" />

      <form id={`f-${task.id}`} onSubmit={submit} className={multi ? 'parts' : 'answers'}>
        {parts.map((p, i) =>
          multi ? (
            <div className="part" key={i}>
              <span className="part__label">{p.label}</span>
              <input
                inputMode={answerInputMode}
                autoComplete="off"
                className={cls(i)}
                readOnly={done || okParts[i]}
                value={shownValue(i)}
                placeholder={done ? 'Нет ответа' : 'Введите число'}
                onChange={(e) => {
                  setInputs(inputs.map((v, k) => (k === i ? e.target.value : v)))
                  setMessage('')
                }}
              />
              {done && <span className="part__right">Верно: {fmt(p.answer)}</span>}
            </div>
          ) : (
            <div className="answers__row" key={i}>
              <label>
                <span>Правильный ответ:</span>
                <input readOnly disabled={!done} value={done ? fmt(p.answer) : '•••'} />
              </label>
              <label>
                <span>Ваш ответ:</span>
                <input
                  inputMode={answerInputMode}
                  autoComplete="off"
                  className={cls(i)}
                  readOnly={done}
                  value={shownValue(i)}
                  placeholder={done ? 'Вы не указали этот ответ' : 'Введите число'}
                  onChange={(e) => {
                    setInputs([e.target.value])
                    setMessage('')
                  }}
                />
              </label>
            </div>
          ),
        )}
      </form>

      {message && !done && <div className="msg">{message}</div>}
      {!done && lockLeft > 0 && (
        <div className="msg msg--pause">
          Сделайте паузу и перепроверьте решение{hintsLeft ? ' — или возьмите подсказку' : ''}. Ответить можно
          через {lockLeft}{'\u00a0'}с.
        </div>
      )}

      {shownHints.map((h, i) => (
        <div className="hint" key={i}>
          <div className="hint__title">
            Подсказка {hints.length > 1 ? `${i + 1} из ${hints.length}` : ''}
          </div>
          <MathText text={h} />
        </div>
      ))}

      {done && task.solution && (
        <div className="solution">
          <div className="solution__title">Решение задачи:</div>
          <MathText text={task.solution} />
        </div>
      )}

      {!done && confirmSkip && (
        <div className="skip-banner">
          <div className="skip-banner__title">Если посмотреть ответ, вам не начислятся XP</div>
          <div className="skip-banner__btns">
            <button className="btn btn--primary" onClick={() => setConfirmSkip(false)}>
              Вернуться и решить
            </button>
            <button className="btn btn--ghost" onClick={skip}>
              Посмотреть ответ
            </button>
          </div>
        </div>
      )}

      {!done && !confirmSkip && (
        <div className="actions">
          <div className="actions__btns">
            {hints.length > 0 && (
              <button
                type="button"
                className={`btn btn--ghost ${nudge ? 'btn--nudge' : ''}`}
                onClick={useHint}
                disabled={!hintsLeft}
              >
                {!hintsLeft
                  ? 'Подсказки закончились'
                  : `${nudge ? 'Застряли? ' : ''}Подсказка${nextHintCost > 0 ? ` −${nextHintCost} XP` : ''}`}
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmSkip(true)}>
              Я не знаю
            </button>
            <button className="btn btn--primary" type="submit" form={`f-${task.id}`} disabled={lockLeft > 0}>
              {lockLeft > 0 ? `Ответить (${lockLeft} с)` : 'Ответить'}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className={`result result--${status === 'correct' ? 'ok' : 'bad'}`}>
          <div>
            <div className="result__title">
              {status === 'correct'
                ? 'Классно! Так держать!'
                : status === 'skipped'
                  ? 'Задача не засчитана'
                  : 'Попытки закончились — задача не засчитана'}
            </div>
            {status === 'correct' && (
              <div className="result__sub">{xpBreakdown(task, hintsUsed, errors, state.xp)}</div>
            )}
            {status === 'skipped' && <div className="result__sub">Ответ просмотрен — 0 XP</div>}
          </div>
          <div className="result__right">
            {status === 'correct' && <span className="result__xp">+ {state.xp} XP</span>}
            {hasNext && (
              <button className="btn btn--white" onClick={onNext}>
                Дальше
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
