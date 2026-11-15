import { useEffect, useState } from 'react'
import MathText from './Math.jsx'
import { calcXp, errorCost, errorsOf, hintCost, minXp, plural, taskMaxXp } from '../lib.js'
import { typeOf } from '../types/index.js'
import { views } from '../types/views.js'

// «20 − 5 за подсказку − 8 за 2 ошибки» — откуда взялось итоговое XP
function xpBreakdown(task, course, hints, errors, xp) {
  if (!hints && !errors) return 'Без ошибок и подсказок — максимум'
  const max = taskMaxXp(task, course)
  const items = [`${max}`]
  if (hints) items.push(`− ${hints * hintCost(task, course)} за ${hints > 1 ? hints + ' ' : ''}${plural(hints, 'подсказку', 'подсказки', 'подсказок')}`)
  if (errors) items.push(`− ${errors * errorCost(task, course)} за ${errors > 1 ? errors + ' ' : ''}${plural(errors, 'ошибку', 'ошибки', 'ошибок')}`)
  let line = items.join(' ')
  if (xp === minXp(task, course) && max - hints * hintCost(task, course) - errors * errorCost(task, course) < xp)
    line += ` · но не меньше ${xp} XP, раз решили сами`
  return line
}

// Задача: общая часть для всех типов — шапка с ценой, условие, подсказки, «Я не знаю»,
// пауза от перебора, разбор и итог. Само поле ответа рисует отображение типа (types/<тип>/View.jsx).
//   task     — открытая часть задачи (без ответа)
//   state    — сохранённое состояние, revealed — что уже можно показать (подсказки, разбор, ответ)
//   actions  — { submit(input), hint(), skip() }: уходят в интерфейс api и возвращают результат
export default function Task({ course, task, index, state, revealed, actions, onNext, hasNext }) {
  const type = typeOf(task)
  const View = views[type?.id]
  const hintCount = task.hintCount ?? 0
  const { status, hintsUsed } = state
  const errors = errorsOf(state)
  const done = status !== 'pending'

  // Что сейчас введено — в том виде, который понимает тип задачи
  const [input, setInput] = useState(() => type?.emptyInput(task))
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [message, setMessage] = useState('')
  const [delta, setDelta] = useState(null) // всплывающее «−4» у плашки XP
  const [busy, setBusy] = useState(false)

  // Пауза от перебора: тикаем, пока она идёт
  const [now, setNow] = useState(Date.now)
  const lockLeft = Math.max(0, Math.ceil(((state.lockUntil || 0) - now) / 1000))
  useEffect(() => {
    if (!state.lockUntil || state.lockUntil <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [state.lockUntil])

  if (!type || !View)
    return (
      <div className="task">
        <h3 className="task__title">{task.title}</h3>
        <div className="msg">Этот тип задачи («{String(task.type)}») сайт пока не умеет показывать.</div>
      </div>
    )

  const potential = calcXp(task, course, hintsUsed, errors)
  const showDelta = (lost) => {
    if (lost > 0) setDelta({ value: lost, key: Date.now() })
  }

  // Действие уходит в api; пока ждём ответа, кнопки не нажимаются повторно
  async function run(action) {
    if (busy) return null
    setBusy(true)
    try {
      return await action()
    } catch {
      setMessage('Не получилось отправить. Проверьте связь и попробуйте ещё раз.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function useHint() {
    if (hintsUsed >= hintCount) return
    const result = await run(actions.hint)
    if (result?.kind === 'hint') showDelta(potential - calcXp(task, course, result.state.hintsUsed, errors))
  }

  async function submit(e) {
    e.preventDefault()
    if (lockLeft > 0) return
    const result = await run(() => actions.submit(input))
    if (!result) return
    // Ввод не разобран — это опечатка, а не ошибка в решении: XP не снимается
    if (result.kind === 'invalid') return setMessage(result.message)
    if (result.kind === 'correct') return setMessage('')
    if (result.kind !== 'wrong') return
    setNow(Date.now())
    showDelta(result.xpLost)
    setMessage(result.xpLost > 0 ? `${result.note}, −${result.xpLost} XP. Попробуйте ещё раз.` : `${result.note}. Попробуйте ещё раз.`)
    setInput(type.emptyInput(task))
  }

  async function skip() {
    const result = await run(actions.skip)
    if (!result) return
    setConfirmSkip(false)
    setMessage('')
  }

  const shownHints = revealed?.hints ?? []
  const hintsLeft = hintsUsed < hintCount
  const nextHintCost = potential - calcXp(task, course, hintsUsed + 1, errors)
  const nudge = errors > 0 && hintsLeft

  return (
    <div className="task">
      <div className="task__head">
        <span>Задача {index + 1}</span>
        {!done && (
          <span className="xp-pill" title={`Максимум за задачу — ${taskMaxXp(task, course)} XP`}>
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

      <form id={`f-${task.id}`} onSubmit={submit}>
        <View
          task={task}
          state={state}
          done={done}
          revealed={revealed}
          input={input}
          setInput={(value) => {
            setInput(value)
            setMessage('')
          }}
        />
      </form>

      {message && !done && <div className="msg">{message}</div>}
      {!done && lockLeft > 0 && (
        <div className="msg msg--pause">
          Сделайте паузу и перепроверьте решение{hintsLeft ? ' — или возьмите подсказку' : ''}. Ответить можно
          через {lockLeft}{' '}с.
        </div>
      )}

      {shownHints.map((h, i) => (
        <div className="hint" key={i}>
          <div className="hint__title">
            Подсказка {hintCount > 1 ? `${i + 1} из ${hintCount}` : ''}
          </div>
          <MathText text={h} />
        </div>
      ))}

      {done && revealed?.solution && (
        <div className="solution">
          <div className="solution__title">Решение задачи:</div>
          <MathText text={revealed.solution} />
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
          <div className="actions__btns">
            {hintCount > 0 && (
              <button
                type="button"
                className={`btn btn--ghost ${nudge ? 'btn--nudge' : ''}`}
                onClick={useHint}
                disabled={!hintsLeft || busy}
              >
                {!hintsLeft
                  ? 'Подсказки закончились'
                  : `${nudge ? 'Застряли? ' : ''}Подсказка${nextHintCost > 0 ? ` −${nextHintCost} XP` : ''}`}
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmSkip(true)}>
              Я не знаю
            </button>
            <button className="btn btn--primary" type="submit" form={`f-${task.id}`} disabled={lockLeft > 0 || busy}>
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
              <div className="result__sub">{xpBreakdown(task, course, hintsUsed, errors, state.xp)}</div>
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
