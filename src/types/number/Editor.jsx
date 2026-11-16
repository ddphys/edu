import { Check, Field, Num, RowTools, Text } from '../../admin/fields.jsx'
import { shift } from '../../admin/model.js'

// Форма типа «Число» в редакторе.
//   task — задача, change(fn) — изменить её, path — адрес задачи для замечаний
export default function NumberEditor({ task, change, path }) {
  const multi = Array.isArray(task.parts)

  const setMulti = (on) =>
    change((t) => {
      if (on) {
        t.parts = [{ label: '', answer: t.answer, tolerance: t.tolerance }, { label: '', answer: undefined }]
        delete t.answer
        delete t.tolerance
      } else {
        const first = t.parts?.[0]
        t.answer = first?.answer
        t.tolerance = first?.tolerance
        delete t.parts
      }
    })

  return (
    <div className="adm-type">
      <Check
        label="Несколько полей ответа"
        hint="Задача засчитывается, когда верны все поля. Верные поля фиксируются, одна отправка — одна ошибка."
        checked={multi}
        onChange={setMulti}
      />
      {!multi && (
        <div className="adm-row">
          <Num label="Верный ответ" path={`${path}/answer`} value={task.answer} onChange={(v) => change((t) => void (t.answer = v))} placeholder="Например, 2,5" />
          <Num label="Допуск ±" path={`${path}/tolerance`} hint="Пусто — ответ должен совпасть точно" value={task.tolerance} onChange={(v) => change((t) => void (t.tolerance = v))} placeholder="0" />
        </div>
      )}
      {multi && (
        <Field path={`${path}/parts`}>
          {task.parts.map((part, i) => (
            <div className="adm-row adm-row--part" key={i}>
              <Text label="Подпись поля" path={`${path}/parts/${i}/label`} value={part.label} onChange={(v) => change((t) => void (t.parts[i].label = v))} placeholder="Например: Время полёта, с" />
              <Num label="Верный ответ" path={`${path}/parts/${i}/answer`} value={part.answer} onChange={(v) => change((t) => void (t.parts[i].answer = v))} />
              <Num label="Допуск ±" path={`${path}/parts/${i}/tolerance`} value={part.tolerance} onChange={(v) => change((t) => void (t.parts[i].tolerance = v))} placeholder="0" />
              <RowTools
                what={`Поле ${i + 1}`}
                onUp={i > 0 ? () => change((t) => shift(t.parts, i, -1)) : null}
                onDown={i < task.parts.length - 1 ? () => change((t) => shift(t.parts, i, 1)) : null}
                onDelete={task.parts.length > 1 ? () => change((t) => void t.parts.splice(i, 1)) : null}
              />
            </div>
          ))}
          <button type="button" className="adm-link" onClick={() => change((t) => void t.parts.push({ label: '', answer: undefined }))}>
            ＋ Поле ответа
          </button>
        </Field>
      )}
    </div>
  )
}
