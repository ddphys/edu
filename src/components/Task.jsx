import { useEffect, useRef, useState } from 'react'
import Attach from './Attach.jsx'
import MathText from './Math.jsx'
import { useActiveTime } from './useActiveTime.js'
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
//   canAttach — ученику разрешено прикладывать фото решения (у задачи должно быть включено attach)
//   showTitle — показывать ли строку с номером и названием (у свёрнутой-развёрнутой задачи она уже есть)
//
// На экране главное — условие, поле ответа и кнопка «Ответить». Всё остальное (цена, подсказка,
// «Я не знаю», фото решения) — тихим текстом, чтобы не отвлекать от задачи.
export default function Task({ course, task, index, state, revealed, actions, canAttach, onNext, hasNext, showTitle = true }) {
  const type = typeOf(task)
  const View = views[type?.id]
  const hintCount = task.hintCount ?? 0
  const { status, hintsUsed } = state
  const errors = errorsOf(state)
  const done = status !== 'pending'

  // Что сейчас введено — в том виде, который понимает тип задачи
  const [input, setInput] = useState(() => type?.emptyInput(task))
  const [confirmSkip, setConfirmSkip] = useState(false)
  // Сообщение под полем: { text, retry } — retry значит «это была неверная попытка»
  const [message, setMessage] = useState(null)
  const [delta, setDelta] = useState(null) // всплывающее «−4» у плашки XP
  const [busy, setBusy] = useState(false)

  // Сколько задача была на экране с прошлого действия — уходит в журнал попыток вместе с ответом
  const root = useRef(null)
  const takeTime = useActiveTime(root, !done)
  const meta = () => ({ ms: takeTime() })

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
      setMessage({ text: 'Не получилось отправить. Проверьте связь и попробуйте ещё раз.' })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function useHint() {
    if (hintsUsed >= hintCount) return
    const result = await run(() => actions.hint(meta()))
    if (result?.kind === 'hint') showDelta(potential - calcXp(task, course, result.state.hintsUsed, errors))
  }

  async function submit(e) {
    e.preventDefault()
    if (lockLeft > 0) return
    const result = await run(() => actions.submit(input, meta()))
    if (!result) return
    // Ввод не разобран — это опечатка, а не ошибка в решении: XP не снимается
    if (result.kind === 'invalid') return setMessage({ text: result.message })
    if (result.kind === 'correct') return setMessage(null)
    if (result.kind !== 'wrong') return
    setNow(Date.now())
    showDelta(result.xpLost)
    setMessage({ text: result.xpLost > 0 ? `${result.note}, −${result.xpLost} XP.` : `${result.note}.`, retry: true })
    setInput(type.emptyInput(task))
  }

  async function skip() {
    const result = await run(() => actions.skip(meta()))
    if (!result) return
    setConfirmSkip(false)
    setMessage(null)
  }

  const shownHints = revealed?.hints ?? []
  const hintsLeft = hintsUsed < hintCount
  const nextHintCost = potential - calcXp(task, course, hintsUsed + 1, errors)
  const nudge = errors > 0 && hintsLeft

  const attach = task.attach && canAttach ? <Attach courseId={course.id} taskId={task.id} /> : null
  const showLinks = !done && !confirmSkip
  const pauseText = `Сделайте паузу и перепроверьте решение — ответить можно через ${lockLeft}\u00a0с.`

  return (
    <div className="task" ref={root}>
      <div className="task__head">
        {showTitle ? (
          <h3 className="task__title">
            {index + 1}. {task.title}
          </h3>
        ) : (
          <span />
        )}
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
      <MathText text={task.text} className="task__text" />

      <form id={`f-${task.id}`} onSubmit={submit} className={`answer ${type.inline?.(task) ? 'answer--inline' : 'answer--stack'}`}>
        <View
          task={task}
          state={state}
          done={done}
          revealed={revealed}
          input={input}
          setInput={(value) => {
            setInput(value)
            setMessage(null)
          }}
        />
        {!done && (
          <button className="btn btn--primary" type="submit" disabled={lockLeft > 0 || busy}>
            {lockLeft > 0 ? `Ответить (${lockLeft} с)` : 'Ответить'}
          </button>
        )}
      </form>

      {/* Ошибка и пауза — одним сообщением */}
      {!done && (message || lockLeft > 0) && (
        <div className={`msg ${message ? '' : 'msg--pause'}`} role="status">
          {message?.text}
          {message?.retry ? (lockLeft > 0 ? ` ${pauseText}` : ' Попробуйте ещё раз.') : ''}
          {!message && pauseText}
        </div>
      )}

      {(showLinks || attach) && (
        <div className="task__more">
          {showLinks && hintsLeft && (
            <button type="button" className={`quiet ${nudge ? 'quiet--nudge' : ''}`} onClick={useHint} disabled={busy}>
              {nudge ? 'Застряли? ' : ''}Подсказка{nextHintCost > 0 ? ` −${nextHintCost} XP` : ''}
            </button>
          )}
          {showLinks && (
            <button type="button" className="quiet" onClick={() => setConfirmSkip(true)}>
              Я не знаю
            </button>
          )}
          {attach}
        </div>
      )}

      {!done && confirmSkip && (
        <div className="skip-banner">
          <span>Показать ответ и разбор? XP за задачу не будет.</span>
          <span className="skip-banner__btns">
            <button type="button" className="btn btn--ghost btn--small" onClick={skip} disabled={busy}>
              Показать ответ
            </button>
            <button type="button" className="quiet" onClick={() => setConfirmSkip(false)}>
              Вернуться к задаче
            </button>
          </span>
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
          <div className="solution__title">Решение</div>
          <MathText text={revealed.solution} />
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
