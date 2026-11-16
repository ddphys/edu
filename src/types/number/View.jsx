import { answerInputMode } from '../../lib.js'
import { getParts } from './index.js'

// Поля числового ответа: одно поле или несколько с подписями.
//   input / setInput — что сейчас введено (строка на каждое поле)
//   revealed.answer.parts — верные значения, которые уже можно показать
export default function NumberView({ task, state, done, revealed, input, setInput }) {
  const parts = getParts(task)
  const multi = parts.length > 1
  // В совсем старых сохранениях решённой задачи списка верных полей нет
  const okParts = state.status === 'correct' ? parts.map(() => true) : state.okParts || []
  const right = (i) => revealed?.answer?.parts?.[i] ?? ''

  // В старых сохранениях ответ лежал одной строкой в state.answer
  const savedAnswer = (i) => state.answers?.[i] ?? (i === 0 ? state.answer : '') ?? ''
  const shownValue = (i) => (done ? savedAnswer(i) : okParts[i] ? right(i) : (input[i] ?? ''))
  const cls = (i) => (done ? (okParts[i] ? 'ok' : 'bad') : okParts[i] ? 'ok' : '')
  const change = (i, value) => setInput(parts.map((_, k) => (k === i ? value : (input[k] ?? ''))))

  if (multi)
    return (
      <div className="parts">
        {parts.map((p, i) => (
          <div className="part" key={i}>
            <span className="part__label">{p.label}</span>
            <input
              inputMode={answerInputMode}
              autoComplete="off"
              className={cls(i)}
              readOnly={done || okParts[i]}
              value={shownValue(i)}
              placeholder={done ? 'Нет ответа' : 'Введите число'}
              onChange={(e) => change(i, e.target.value)}
            />
            {done && <span className="part__right">Верно: {right(i)}</span>}
          </div>
        ))}
      </div>
    )

  // До ответа — одно поле. После — свой ответ и, если он не верный, правильный.
  if (!done)
    return (
      <div className="answers">
        <input
          inputMode={answerInputMode}
          autoComplete="off"
          aria-label="Ваш ответ"
          value={shownValue(0)}
          placeholder="Ваш ответ — число"
          onChange={(e) => change(0, e.target.value)}
        />
      </div>
    )

  return (
    <div className="answers answers--done">
      <label>
        <span>Ваш ответ</span>
        <input readOnly className={cls(0)} value={shownValue(0)} placeholder="Нет ответа" />
      </label>
      {state.status !== 'correct' && (
        <label>
          <span>Правильный ответ</span>
          <input readOnly value={right(0)} />
        </label>
      )}
    </div>
  )
}
