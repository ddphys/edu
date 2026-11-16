// Все ситуации тренажёра «Сила трения»: шаблоны уровней и поиск по номеру.
import { level1 } from './level1.js'
import { level2 } from './level2.js'

export const SITUATIONS = [...level1, ...level2]

export const situationsOf = (level) => SITUATIONS.filter((s) => s.level === level)
export const situationById = (id) => SITUATIONS.find((s) => s.id === id)
