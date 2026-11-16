import { Check, Field, Rich, RowTools } from '../../admin/fields.jsx'

// Форма типа «Выбор варианта» в редакторе.
// Номера верных вариантов (correct) при удалении и перестановке вариантов пересчитываются.
export default function ChoiceEditor({ task, change, path }) {
  const options = task.options ?? []
  const correct = task.correct ?? []
  const multiple = Boolean(task.multiple)

  const mark = (i, on) =>
    change((t) => {
      const set = new Set(t.correct ?? [])
      if (!t.multiple) set.clear()
      if (on) set.add(i)
      else set.delete(i)
      t.correct = [...set].sort((a, b) => a - b)
    })

  const remove = (i) =>
    change((t) => {
      t.options.splice(i, 1)
      t.correct = (t.correct ?? []).filter((c) => c !== i).map((c) => (c > i ? c - 1 : c))
    })

  const swap = (i, j) =>
    change((t) => {
      ;[t.options[i], t.options[j]] = [t.options[j], t.options[i]]
      t.correct = (t.correct ?? []).map((c) => (c === i ? j : c === j ? i : c)).sort((a, b) => a - b)
    })

  const setMultiple = (on) =>
    change((t) => {
      if (on) t.multiple = true
      else {
        delete t.multiple
        t.correct = (t.correct ?? []).slice(0, 1)
      }
    })

  return (
    <div className="adm-type">
      <Check label="Несколько верных вариантов" hint="Ученик отмечает все верные; засчитывается только точный набор." checked={multiple} onChange={setMultiple} />
      <Field label="Варианты ответа — отметьте верные" path={`${path}/options`}>
        {options.map((option, i) => (
          <div className="adm-option" key={i}>
            <label className="adm-option__mark" title="Верный вариант">
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={`correct-${task._key}`}
                aria-label={`Вариант ${i + 1} верный`}
                checked={correct.includes(i)}
                onChange={(e) => mark(i, e.target.checked)}
              />
            </label>
            <Rich compact label={`Вариант ${i + 1}`} path={`${path}/options/${i}`} rows={1} value={option} onChange={(v) => change((t) => void (t.options[i] = v))} />
            <RowTools
              what={`Вариант ${i + 1}`}
              onUp={i > 0 ? () => swap(i, i - 1) : null}
              onDown={i < options.length - 1 ? () => swap(i, i + 1) : null}
              onDelete={options.length > 2 ? () => remove(i) : null}
            />
          </div>
        ))}
        <button type="button" className="adm-link" onClick={() => change((t) => void (t.options = [...(t.options ?? []), '']))}>
          ＋ Вариант
        </button>
      </Field>
      <Field path={`${path}/correct`} />
    </div>
  )
}
