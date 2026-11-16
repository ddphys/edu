import MathText from '../../components/Math.jsx'

// Варианты ответа: кружки, если верный вариант один, и квадраты, если их может быть несколько.
// input — номера отмеченных вариантов.
export default function ChoiceView({ task, state, done, revealed, input, setInput }) {
  const options = task.options ?? []
  const multiple = Boolean(task.multiple)
  const tried = state.tried || []
  const correct = revealed?.answer?.correct ?? []
  const chosen = done ? (state.answers ?? []) : (input ?? [])

  const toggle = (i) => {
    if (!multiple) return setInput([i])
    setInput(chosen.includes(i) ? chosen.filter((v) => v !== i) : [...chosen, i])
  }

  return (
    <div className="choice" role={multiple ? 'group' : 'radiogroup'} aria-label="Варианты ответа">
      {!done && <div className="choice__note">{multiple ? 'Отметьте все верные варианты' : 'Выберите один вариант'}</div>}
      {options.map((option, i) => {
        const picked = chosen.includes(i)
        let cls = ''
        if (done) cls = correct.includes(i) ? 'is-right' : picked ? 'is-wrong' : ''
        else if (tried.includes(i)) cls = 'is-tried'
        else if (picked) cls = 'is-picked'
        return (
          <button
            key={i}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={picked}
            className={`option ${cls}`}
            disabled={done || tried.includes(i)}
            onClick={() => toggle(i)}
          >
            <span className={`option__mark ${multiple ? 'option__mark--box' : ''}`} aria-hidden="true" />
            <MathText text={option} />
            {!done && tried.includes(i) && <span className="option__tag">неверно</span>}
            {done && picked && <span className="option__tag">ваш выбор</span>}
          </button>
        )
      })}
    </div>
  )
}
