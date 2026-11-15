import { answerInputMode } from '../../lib.js'
import { getParts } from './index.js'

// Поля числового ответа. Одно поле показывается рядом с «Правильным ответом»,
// несколько — списком с подписями.
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

  return (
    <div className="answers">
      <label>
        <span>Правильный ответ:</span>
        <input readOnly disabled={!done} value={done ? right(0) : '•••'} />
      </label>
      <label>
        <span>Ваш ответ:</span>
        <input
          inputMode={answerInputMode}
          autoComplete="off"
          className={cls(0)}
          readOnly={done}
          value={shownValue(0)}
          placeholder={done ? 'Вы не указали этот ответ' : 'Введите число'}
          onChange={(e) => change(0, e.target.value)}
        />
      </label>
    </div>
  )
}
