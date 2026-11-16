// Одно задание = ситуация-шаблон + случайные «обёртки»: зеркало и угол склона.
// Здесь всё, что про смысл задания (верный ответ, тексты, кнопки); как оно рисуется — в draw/.
// Чистые функции, без React: их проверяют тесты и автопроход.
import { situationById } from './scenes/index.js'

// Тип трения: то, что выбирают на шаге 1
export const TYPES = [
  { code: 'rest', label: 'Покоя', heading: 'это трение покоя' },
  { code: 'slide', label: 'Скольжения', heading: 'это трение скольжения' },
  { code: 'none', label: 'Трения нет', heading: 'трения здесь нет' },
  { code: 'unknown', label: 'Не определить без расчёта', heading: 'без расчёта не определить' },
]
export const typeOf = (code) => TYPES.find((t) => t.code === code)

// Углы склона; номер варианта выбирает движок. Угол только для вида: на ответ не влияет.
export const ANGLES = [22, 28, 34]

const FLIP = { left: 'right', right: 'left' }
export const flipDir = (dir) => FLIP[dir] ?? dir

// Слова для текстов: в зеркальном варианте «вправо» и «влево» меняются местами
const words = (mirror) => ({ right: mirror ? 'влево' : 'вправо', left: mirror ? 'вправо' : 'влево' })

// Есть ли шаг 2 (направление): только у трения покоя и скольжения
export const needsDirection = (type) => type === 'rest' || type === 'slide'

// Сколько у ситуации вариантов угла (у склона — несколько, у стола и стены — один)
export const variantsOf = (sit) => (sit.surface === 'incline' ? ANGLES.length : 1)

// Ситуация можно отразить: у стола и стены меняются стороны, у склона — наклон.
// Ответ при этом меняется только у «влево / вправо» (стол); «вверх / вниз» остаются.
export const canMirror = () => true

// Готовое задание: всё, что нужно показать и проверить
export function describe(sit, { mirror = false, variant = 0 } = {}) {
  const h = words(mirror)
  const dir = sit.surface === 'table' && mirror && sit.dir ? flipDir(sit.dir) : (sit.dir ?? null)
  return {
    id: sit.id,
    level: sit.level,
    surface: sit.surface,
    mirror,
    variant,
    angle: sit.surface === 'incline' ? ANGLES[variant % ANGLES.length] : null,
    text: sit.text(h),
    ask: `Сила трения на ${sit.body} со стороны ${sit.support}`,
    body: sit.body,
    support: sit.support,
    figure: sit.figure,
    type: sit.type,
    dir,
    why: sit.why(h),
    motion: sit.motion(h),
  }
}

// Задание по записи из серии: { id, mirror, variant }
export const instanceOf = (slot) => describe(situationById(slot.id), slot)

// Кнопки шага 2: у стола — влево / вправо, у склона — вверх / вниз по склону, у стены — вверх / вниз.
// Порядок кнопок всегда один и тот же, зеркало меняет только значок стрелки.
export function dirOptions(inst) {
  if (inst.surface === 'table')
    return [
      { code: 'left', label: 'Влево', icon: '←', iconFirst: true, words: 'влево' },
      { code: 'right', label: 'Вправо', icon: '→', iconFirst: false, words: 'вправо' },
    ]
  if (inst.surface === 'incline')
    return [
      { code: 'up', label: 'Вверх по склону', icon: inst.mirror ? '↖' : '↗', iconFirst: true, words: 'вверх по склону' },
      { code: 'down', label: 'Вниз по склону', icon: inst.mirror ? '↘' : '↙', iconFirst: true, words: 'вниз по склону' },
    ]
  return [
    { code: 'up', label: 'Вверх', icon: '↑', iconFirst: true, words: 'вверх' },
    { code: 'down', label: 'Вниз', icon: '↓', iconFirst: true, words: 'вниз' },
  ]
}

export const dirWords = (inst, dir) => dirOptions(inst).find((o) => o.code === dir)?.words ?? ''

// Проверка ответа. type — выбор на шаге 1, dir — на шаге 2 (если он был).
export function checkType(inst, type) {
  return type === inst.type
}
export function checkDir(inst, dir) {
  return dir === inst.dir
}
// Верный ответ целиком: { type, dir } (dir нет у «нет» и «?»)
export const correctAnswer = (inst) => (needsDirection(inst.type) ? { type: inst.type, dir: inst.dir } : { type: inst.type })

// Разбор по общему алгоритму (план, раздел «Алгоритм»): шаги для кнопки «Не понял».
export function explainSteps(inst) {
  const { body, support } = inst
  const Body = body[0].toUpperCase() + body.slice(1)
  const dirText = inst.dir ? dirWords(inst, inst.dir) : ''
  const steps = [`${Body} касается только ${support} — трение только со стороны ${support}.`]
  if (inst.type === 'slide') steps.push(`${Body} проскальзывает относительно ${support} → трение скольжения.`)
  else steps.push(`Проскальзывания нет: ${body} неподвижен относительно ${support} → трение покоя или его нет.`)
  steps.push(inst.motion)
  if (inst.type === 'slide') steps.push(`Трение скольжения — против относительной скорости: **${dirText}**.`)
  else if (inst.type === 'rest') steps.push(`Трение покоя — против того, куда ${body} поехал бы без трения: **${dirText}**.`)
  else if (inst.type === 'none') steps.push('Скользить телу не к чему, трение покоя не нужно → **трения нет**.')
  else steps.push('Ответ зависит от числа, которого мы не знаем → **без расчёта не определить**.')
  return steps
}

// Заголовок карточки разбора. stage — на каком шаге ошиблись: 'type' (тип) или 'dir' (направление)
export function reviewHeading(inst, { ok, stage = 'type' }) {
  const withDir = inst.dir !== null
  if (ok) return `Верно: ${withDir ? `${typeOf(inst.type).heading}, ${dirWords(inst, inst.dir)}` : typeOf(inst.type).heading}`
  if (stage === 'dir') return `Не совсем: трение — ${dirWords(inst, inst.dir)}`
  return `Не совсем: ${typeOf(inst.type).heading}${withDir ? `, ${dirWords(inst, inst.dir)}` : ''}`
}
