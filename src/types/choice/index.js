// Тип задачи «Выбор варианта»: один верный вариант или несколько.
//
// Поля задачи:
//   options: ['текст варианта', …]  — в вариантах работают формулы и картинки
//   multiple: true                  — можно отметить несколько вариантов
//   correct: [0, 2]                 — номера верных вариантов, считая с нуля
// Ученику до ответа отдаются варианты и признак multiple; correct — закрытая часть.
//
// Ввод ученика и state.answers — список номеров отмеченных вариантов.
// При одном верном варианте уже проверенные неверные запоминаются в state.tried
// и повторно не выбираются.

const isInt = Number.isInteger
const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v))

function selection(task, input) {
  const count = (task.options ?? []).length
  const picked = (Array.isArray(input) ? input : []).filter((i) => isInt(i) && i >= 0 && i < count)
  return [...new Set(picked)].sort((a, b) => a - b)
}

export default {
  id: 'choice',
  title: 'Выбор варианта',
  hint: 'Ученик выбирает один вариант или отмечает несколько. В вариантах работают формулы и картинки.',

  create: () => ({ options: ['', ''], correct: [] }),

  split: (task) => ({
    pub: { options: task.options ?? [], multiple: task.multiple || undefined },
    priv: { correct: task.correct ?? [] },
  }),

  merge: (pub, priv = {}) => ({ correct: priv.correct }),

  validate(task, issue) {
    const options = Array.isArray(task.options) ? task.options : []
    if (options.length < 2) issue('options', 'Нужно хотя бы два варианта ответа')
    const seen = new Set()
    options.forEach((o, i) => {
      if (typeof o !== 'string' || !o.trim()) return issue(`options/${i}`, `Вариант ${i + 1} пустой`)
      if (seen.has(o.trim())) issue(`options/${i}`, `Вариант ${i + 1} повторяет другой вариант`, 'warn')
      seen.add(o.trim())
    })

    const correct = task.correct
    if (!Array.isArray(correct) || correct.length === 0) return issue('correct', 'Не отмечен верный вариант — у задачи нет ответа')
    if (correct.some((i) => !isInt(i) || i < 0 || i >= options.length))
      return issue('correct', `Номер верного варианта вне списка: вариантов всего ${options.length}`)
    if (new Set(correct).size !== correct.length) issue('correct', 'Один и тот же вариант отмечен верным дважды')
    if (!task.multiple && correct.length > 1)
      issue('correct', 'Отмечено несколько верных вариантов — включите «Несколько верных» или оставьте один')
  },

  // Тексты с разметкой — проверка контента ищет в них битые формулы и картинки
  texts: (task) => (task.options ?? []).map((text, i) => ({ field: `options/${i}`, text, what: `Вариант ${i + 1}` })),

  emptyInput: () => [],

  check(task, input, state) {
    const picked = selection(task, input)
    const tried = state.tried || []
    if (picked.length === 0) return { invalid: task.multiple ? 'Отметьте хотя бы один вариант' : 'Выберите вариант ответа' }
    if (!task.multiple) {
      if (picked.length > 1) return { invalid: 'Выберите один вариант' }
      if (tried.includes(picked[0])) return { invalid: 'Этот вариант вы уже проверяли — выберите другой' }
    }
    if (sameSet(picked, task.correct ?? [])) return { correct: true, patch: { answers: picked } }
    // При нескольких верных не говорим, какие именно отмечены неверно, — иначе ответ подбирается
    return { correct: false, patch: task.multiple ? {} : { tried: [...tried, picked[0]] }, note: 'Неверно' }
  },

  onSkip: () => ({ answers: [] }),

  // Верные варианты показываются только после завершения задачи
  reveal: (task, state, done) => (done ? { correct: [...(task.correct ?? [])] } : null),
}
