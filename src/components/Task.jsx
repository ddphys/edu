import { useState } from 'react'
import MathText from './Math.jsx'
import { calcXp, getParts, isCorrect, maxAttempts, taskMaxXp } from '../lib.js'

const fmt = (n) => String(n).replace('.', ',')

export default function Task({ task, index, state, onChange, onNext, hasNext }) {
  const parts = getParts(task)
  const multi = parts.length > 1
  const { status, attempts, hintsUsed } = state
  const okParts = state.okParts || []
  const done = status !== 'pending'

  // Что сейчас введено в полях (для решённых полей — их верный ответ)
  const [inputs, setInputs] = useState(() => parts.map(() => ''))
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [message, setMessage] = useState('')

  const shownValue = (i) => (done ? (state.answers?.[i] ?? '') : okParts[i] ? fmt(parts[i].answer) : inputs[i])

  function useHint() {
    if (hintsUsed < task.hints.length) onChange({ ...state, hintsUsed: hintsUsed + 1 })
  }

  function submit(e) {
    e.preventDefault()
    const open = parts.map((_, i) => i).filter((i) => !okParts[i])
    if (open.some((i) => !inputs[i].trim())) return setMessage('Заполните все поля ответа')

    const attemptNumber = attempts + 1
    const nowOk = parts.map((p, i) => okParts[i] || isCorrect(p, inputs[i]))
    const answers = parts.map((p, i) => (nowOk[i] ? fmt(p.answer) : inputs[i]))

    if (nowOk.every(Boolean)) {
      onChange({
        ...state,
        status: 'correct',
        attempts: attemptNumber,
        answers,
        okParts: nowOk,
        xp: calcXp(task, hintsUsed, attemptNumber),
      })
      setMessage('')
    } else if (attemptNumber >= maxAttempts) {
      onChange({ ...state, status: 'wrong', attempts: attemptNumber, answers, okParts: nowOk, xp: 0 })
      setMessage('')
    } else {
      onChange({ ...state, attempts: attemptNumber, okParts: nowOk })
      const left = maxAttempts - attemptNumber
      const wrongCount = nowOk.filter((v) => !v).length
      const now = calcXp(task, hintsUsed, attemptNumber + 1)
      setMessage(
        `${multi ? `Неверных ответов: ${wrongCount}. ` : 'Неверно. '}Осталось попыток: ${left}. Теперь за верное решение: ${now} XP`,
      )
      setInputs(parts.map(() => ''))
    }
  }

  function skip() {
    onChange({ ...state, status: 'skipped', xp: 0 })
    setConfirmSkip(false)
    setMessage('')
  }

  const cls = (i) => (done ? (okParts[i] ? 'ok' : 'bad') : okParts[i] ? 'ok' : '')
  const potential = calcXp(task, hintsUsed, attempts + 1)
  const shownHints = task.hints.slice(0, hintsUsed)

  return (
    <div className="task">
      <div className="task__head">Задача {index + 1}</div>
      <h3 className="task__title">{task.title}</h3>
      <MathText text={task.text} className="task__text" />

      <form id={`f-${task.id}`} onSubmit={submit} className={multi ? 'parts' : 'answers'}>
        {parts.map((p, i) =>
          multi ? (
            <div className="part" key={i}>
              <span className="part__label">{p.label}</span>
              <input
                inputMode="decimal"
                className={cls(i)}
                readOnly={done || okParts[i]}
                value={shownValue(i)}
                placeholder={done ? 'Вы не указали этот ответ' : 'Введите число'}
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
                  inputMode="decimal"
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

      {shownHints.map((h, i) => (
        <div className="hint" key={i}>
          <div className="hint__title">
            Подсказка {task.hints.length > 1 ? `${i + 1} из ${task.hints.length}` : ''}
          </div>
          <MathText text={h} />
        </div>
      ))}

      {done && (
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
          <div className="actions__meta">
            Попытка {attempts + 1} из {maxAttempts} · Подсказок: {hintsUsed} из {task.hints.length}
            <br />
            За верное решение сейчас: <b>{potential} XP</b>
            {potential < taskMaxXp(task) && <> (максимум {taskMaxXp(task)})</>}
          </div>
          <div className="actions__btns">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={useHint}
              disabled={hintsUsed >= task.hints.length}
            >
              {hintsUsed >= task.hints.length ? 'Подсказки закончились' : 'Подсказка'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmSkip(true)}>
              Я не знаю
            </button>
            <button className="btn btn--primary" type="submit" form={`f-${task.id}`}>
              Ответить
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
            <div className="result__sub">
              Попыток: {attempts} из {maxAttempts} · подсказок: {hintsUsed} из {task.hints.length}
            </div>
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
