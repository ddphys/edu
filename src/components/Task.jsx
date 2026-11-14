import { useState } from 'react'
import MathText from './Math.jsx'
import { course } from '../data/course.js'
import { calcXp, isCorrect, taskMaxXp } from '../lib.js'

export default function Task({ task, index, state, onChange, onNext, hasNext }) {
  const [input, setInput] = useState('')
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [message, setMessage] = useState('')

  const { status, attempts, hintsUsed } = state
  const done = status !== 'pending'
  const maxAttempts = course.maxAttempts

  function useHint() {
    if (hintsUsed < task.hints.length) onChange({ ...state, hintsUsed: hintsUsed + 1 })
  }

  function submit(e) {
    e.preventDefault()
    if (!input.trim()) return setMessage('Введите ответ')
    const attemptNumber = attempts + 1
    if (isCorrect(task, input)) {
      onChange({
        ...state,
        status: 'correct',
        attempts: attemptNumber,
        answer: input,
        xp: calcXp(task, hintsUsed, attemptNumber),
      })
      setMessage('')
    } else if (attemptNumber >= maxAttempts) {
      onChange({ ...state, status: 'wrong', attempts: attemptNumber, answer: input, xp: 0 })
      setMessage('')
    } else {
      onChange({ ...state, attempts: attemptNumber })
      setMessage(`Неверно. Осталось попыток: ${maxAttempts - attemptNumber}`)
      setInput('')
    }
  }

  function skip() {
    onChange({ ...state, status: 'skipped', answer: '', xp: 0 })
    setConfirmSkip(false)
    setMessage('')
  }

  const shownHints = task.hints.slice(0, hintsUsed)

  return (
    <div className="task">
      <div className="task__head">
        Задача {index + 1} · {task.title}
      </div>
      <MathText text={task.text} className="task__text" />

      <div className="answers">
        <label>
          <span>Правильный ответ:</span>
          <input readOnly disabled={!done} value={done ? String(task.answer) : '•••'} />
        </label>
        <label>
          <span>Ваш ответ:</span>
          {done ? (
            <input
              readOnly
              className={status === 'correct' ? 'ok' : 'bad'}
              value={state.answer || ''}
              placeholder="Вы не указали этот ответ"
            />
          ) : (
            <form onSubmit={submit} id={`f-${task.id}`}>
              <input
                autoFocus
                inputMode="decimal"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  setMessage('')
                }}
                placeholder="Введите число"
              />
            </form>
          )}
        </label>
      </div>

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
            За решение задачи до <b>{taskMaxXp(task)} XP</b>
          </div>
          <div className="actions__btns">
            <button
              className="btn btn--ghost"
              onClick={useHint}
              disabled={hintsUsed >= task.hints.length}
            >
              {hintsUsed >= task.hints.length ? 'Подсказки закончились' : 'Подсказка'}
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirmSkip(true)}>
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
                  : 'Неверно — задача не засчитана'}
            </div>
            <div className="result__sub">Использовано подсказок: {hintsUsed} из {task.hints.length}</div>
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
