import postgres from 'postgres'
import { config } from './config.js'

export function createDb(url = config.databaseUrl) {
  return postgres(url, {
    onnotice: () => {},
    // count() и bigserial возвращают bigint — превращаем в обычные числа
    types: { bigint: { to: 20, from: [20], parse: Number, serialize: (x) => String(x) } },
    transform: { undefined: null },
  })
}
