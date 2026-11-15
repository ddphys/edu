import { useState } from 'react'
import MathText from './Math.jsx'
import { api } from '../api.js'

// Задача ученика. Проверка ответа, подсказки и «Я не знаю» — на сервере:
// правильные ответы и решение приходят в браузер только после завершения задачи.
export default function Task({ lessonId, task, index, onUpdate, onNext, hasNext }) {
  const { parts, state } = task
  const multi = parts.length > 1
  const { status, attempts, hintsUsed } = state
  const okParts = state.okParts || []
  const done = status !== 'pending'

  const [inputs, setInputs] = useState(() => parts.map(() => ''))
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const url = (action) => `/api/lessons/${lessonId}/tasks/${task.id}/${action}`
  const shownValue = (i) => (done ? (state.answers?.[i] ?? '') : okParts[i] ? parts[i].answer : inputs[i])

  async function run(action, body) {
    setBusy(true)
    try {
      const r = await api.post(url(action), body)
      onUpdate(r.task)
      return r
    } catch (e) {
      setMessage(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    const open = parts.map((_, i) => i).filter((i) => !okParts[i])
    if (open.some((i) => !inputs[i].trim())) return setMessage('Заполните все поля ответа')
    const r = await run('check', { answers: inputs })
    if (!r) return
    if (r.correct || r.task.state.status !== 'pending') return setMessage('')
    setMessage(
      `${multi ? `Неверных ответов: ${r.wrongCount}. ` : 'Неверно. '}Осталось попыток: ${r.attemptsLeft}. Теперь за верное решение: ${r.nextXp} XP`,
    )
    setInputs(parts.map(() => ''))
  }

  async function skip() {
    await run('skip')
    setConfirmSkip(false)
    setMessage('')
  }

  const cls = (i) => (done ? (okParts[i] ? 'ok' : 'bad') : okParts[i] ? 'ok' : '')

  return (
    <div className="task">
      <div className="task__head">
        Задача {index + 1} · {task.title}
      </div>
      <MathText text={task.text} className="task__text" />

      <form id={`f-${task.id}`} onSubmit={submit} className={multi ? 'parts' : 'answers'}>
        {parts.map((p, i) =>
          multi ? (
            <div className="part" key={i}>
              <span className="part__label">
                <MathText text={p.label} inline />
              </span>
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
              {done && <span className="part__right">Верно: {p.answer}</span>}
            </div>
          ) : (
            <div className="answers__row" key={i}>
              <label>
                <span>Правильный ответ:</span>
                <input readOnly disabled={!done} value={done ? p.answer : '•••'} />
              </label>
              <label>
                <span>Ваш ответ:</span>
                <input
                  autoFocus={!done}
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

      {task.hints.map((h, i) => (
        <div className="hint" key={i}>
          <div className="hint__title">Подсказка {task.hintsTotal > 1 ? `${i + 1} из ${task.hintsTotal}` : ''}</div>
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
            <button className="btn btn--ghost" onClick={skip} disabled={busy}>
              Посмотреть ответ
            </button>
          </div>
        </div>
      )}

      {!done && !confirmSkip && (
        <div className="actions">
          <div className="actions__meta">
            Попытка {attempts + 1} из {task.maxAttempts} · Подсказок: {hintsUsed} из {task.hintsTotal}
            <br />
            За верное решение сейчас: <b>{task.potentialXp} XP</b>
            {task.potentialXp < task.maxXp && <> (максимум {task.maxXp})</>}
          </div>
          <div className="actions__btns">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => run('hint')}
              disabled={busy || hintsUsed >= task.hintsTotal}
            >
              {hintsUsed >= task.hintsTotal ? (task.hintsTotal ? 'Подсказки закончились' : 'Подсказок нет') : 'Подсказка'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmSkip(true)}>
              Я не знаю
            </button>
            <button className="btn btn--primary" type="submit" form={`f-${task.id}`} disabled={busy}>
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
              Попыток: {attempts} из {task.maxAttempts} · подсказок: {hintsUsed} из {task.hintsTotal}
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
