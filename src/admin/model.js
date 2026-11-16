// Черновик в памяти редактора — это «полный» контент { site, courses } (см. content/format.js)
// со служебными полями, которые начинаются с «_» и в файлы не попадают:
//   _key  — постоянный ключ курса, урока, задачи, группы, вопроса (чтобы узнавать их после правок)
//   _orig — id, под которым курс, урок или задача уже опубликованы: по нему видно, что id поменяли
import { textImages } from '../content/text.js'
import { DEFAULT_XP_RULES, courseTasks, isGroup } from '../lib.js'
import { types } from '../types/index.js'

export const uid = () => Math.random().toString(36).slice(2, 10)

// Расставляет служебные поля. published: содержимое уже опубликовано (или взято из архива)
export function decorate(content, { published = true } = {}) {
  const c = structuredClone(content)
  c.site ??= {}
  c.courses ??= []
  const mark = (node) => {
    node._key ??= uid()
    if (published && node._orig === undefined && node.id) node._orig = node.id
  }
  for (const course of c.courses) {
    mark(course)
    course.images ??= {}
    course.teacher ??= { name: '', photo: '' }
    course.lessons ??= []
    for (const lesson of course.lessons) {
      mark(lesson)
      lesson.quiz ??= []
      lesson.tasks ??= []
      for (const q of lesson.quiz) q._key ??= uid()
      for (const item of lesson.tasks) {
        if (isGroup(item)) {
          item._key ??= uid()
          item.tasks.forEach(mark)
        } else mark(item)
      }
    }
  }
  return c
}

const firstFree = (make, taken) => {
  for (let n = 1; ; n++) if (!taken.has(make(n))) return make(n)
}

export function newCourse(content) {
  const taken = new Set(content.courses.flatMap((c) => [c.id, c._orig]))
  return {
    _key: uid(),
    id: firstFree((n) => `course-${n}`, taken),
    title: 'Новый курс',
    about: '',
    teacher: { name: '', photo: '' },
    ...structuredClone(DEFAULT_XP_RULES),
    images: {},
    lessons: [],
  }
}

export function newLesson(course) {
  const taken = new Set(course.lessons.flatMap((l) => [l.id, l._orig]))
  return { _key: uid(), id: firstFree((n) => `l${n}`, taken), title: 'Новый урок', description: [], videoUrl: '', quiz: [], tasks: [] }
}

// id новой задачи не должен совпасть ни с одним id курса, в том числе с прежними id опубликованных задач:
// иначе новая задача унаследует чужой прогресс
export function newTaskId(course, lesson) {
  const taken = new Set(courseTasks(course).flatMap((t) => [t.id, t._orig]))
  return firstFree((n) => `${lesson.id || 'l'}t${n}`, taken)
}

export function newTask(course, lesson, typeId) {
  return { _key: uid(), id: newTaskId(course, lesson), type: typeId, title: '', text: '', ...types[typeId].create(), hints: [], solution: '' }
}

export const newGroup = () => ({ _key: uid(), title: '', tasks: [] })
export const newQuizItem = () => ({ _key: uid(), time: 0, question: '', options: ['', ''], correct: null, explain: '' })

// ---------- Перемещение задач и групп ----------
// Куда: { group: ключ группы или null (верхний уровень), before: ключ соседа или null (в конец) }
export function moveItem(lesson, key, to) {
  let item = null
  const take = (list) => {
    const i = list.findIndex((x) => x._key === key)
    if (i !== -1) item = list.splice(i, 1)[0]
    return item
  }
  const lists = [lesson.tasks, ...lesson.tasks.filter(isGroup).map((g) => g.tasks)]
  const before = structuredClone(lesson.tasks)
  for (const list of lists) if (take(list)) break
  if (!item) return
  const target = to.group ? lesson.tasks.find((x) => x._key === to.group)?.tasks : lesson.tasks
  // Группу нельзя положить в группу; цель могла исчезнуть — тогда возвращаем как было
  if (!target || (isGroup(item) && to.group) || to.group === key) return void (lesson.tasks = before)
  const at = to.before ? target.findIndex((x) => x._key === to.before) : -1
  target.splice(at === -1 ? target.length : at, 0, item)
}

export function moveByKey(list, key, beforeKey) {
  const i = list.findIndex((x) => x._key === key)
  if (i === -1 || key === beforeKey) return
  const [item] = list.splice(i, 1)
  const at = beforeKey ? list.findIndex((x) => x._key === beforeKey) : -1
  list.splice(at === -1 ? list.length : at, 0, item)
}

export function shift(list, index, delta) {
  const j = index + delta
  if (j < 0 || j >= list.length) return
  ;[list[index], list[j]] = [list[j], list[index]]
}

// ---------- Картинки ----------
// Все тексты курса с разметкой: [объект, имя поля или номер в списке]
function* textSlots(course) {
  for (const lesson of course.lessons ?? []) {
    for (const q of lesson.quiz ?? []) {
      yield [q, 'question']
      yield [q, 'explain']
      for (let i = 0; i < (q.options ?? []).length; i++) yield [q.options, i]
    }
    for (const task of courseTasks({ lessons: [lesson] })) {
      yield [task, 'text']
      yield [task, 'solution']
      for (let i = 0; i < (task.hints ?? []).length; i++) yield [task.hints, i]
      for (let i = 0; i < (task.options ?? []).length; i++) yield [task.options, i]
    }
  }
}

// Сколько раз используется каждая картинка курса
export function imageUsage(course) {
  const usage = {}
  const add = (name) => (usage[name] = (usage[name] ?? 0) + 1)
  if (course.cover) add(course.cover)
  if (course.teacher?.photo && !/^https?:\/\//.test(course.teacher.photo)) add(course.teacher.photo)
  for (const [obj, key] of textSlots(course)) if (typeof obj[key] === 'string') textImages(obj[key]).forEach(add)
  return usage
}

// Меняет имя картинки во всех текстах курса
export function renameImage(course, from, to) {
  if (from === to) return
  const pattern = new RegExp(`(!\\[[^\\]\\n]*\\]\\()${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[|)])`, 'g')
  for (const [obj, key] of textSlots(course)) if (typeof obj[key] === 'string') obj[key] = obj[key].replace(pattern, `$1${to}`)
  if (course.cover === from) course.cover = to
  if (course.teacher?.photo === from) course.teacher.photo = to
  if (course.images?.[from]) {
    course.images[to] = course.images[from]
    delete course.images[from]
  }
}

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }
export const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }
export const mimeOf = (name) => MIME[name.split('.').pop().toLowerCase()] ?? 'application/octet-stream'
export const extOf = (type) => EXT[type] ?? null

// Имя файла картинки для курса: латиница, без пробелов, не занятое другими картинками
export function imageName(original, type, taken = []) {
  const stem =
    String(original ?? '')
      .replace(/\.[^.]*$/, '')
      .toLowerCase()
      .replace(/[а-яё]/g, (ch) => TRANSLIT[ch] ?? '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'image'
  const ext = extOf(type) ?? 'png'
  const stems = new Set(taken.map((n) => n.replace(/\.[^.]*$/, '')))
  let name = stem
  for (let n = 2; stems.has(name); n++) name = `${stem}-${n}`
  return `${name}.${ext}`
}
