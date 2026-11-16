// Серия тренажёра «Сила трения»: движок (engine.js) + ситуации уровня.
import { answer, startSeries } from '../engine.js'
import { situationsOf } from './scenes/index.js'
import { canMirror, variantsOf } from './instance.js'

export const poolOf = (level) => situationsOf(level).map((s) => ({ id: s.id, mirrorable: canMirror(s), variants: variantsOf(s) }))

export const newSeries = (level, rng) => startSeries(poolOf(level), { rng })
export const nextSeries = (level, series, ok, rng) => answer(series, ok, poolOf(level), rng)
