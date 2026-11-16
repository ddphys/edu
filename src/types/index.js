// Реестр типов задач. Тип — это папка src/types/<id>/:
//   index.js   — данные и проверка: split/merge, validate, check, reveal (без React)
//   View.jsx   — как тип выглядит у ученика (подхватывается сам, см. views.js)
//   Editor.jsx — форма в редакторе курса (подхватывается сама, см. admin/typeEditors.js)
// Чтобы добавить тип: создать папку с этими тремя файлами и дописать одну строку сюда.
import choice from './choice/index.js'
import number from './number/index.js'

export const types = { number, choice }

export const DEFAULT_TYPE = 'number'

// Тип задачи; у старых задач поля type нет — это «Число»
export const typeOf = (task) => types[task?.type ?? DEFAULT_TYPE] ?? null
