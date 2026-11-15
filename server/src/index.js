import { buildApp } from './app.js'
import { config } from './config.js'
import { createDb } from './db.js'
import { migrate } from './migrate.js'

const sql = createDb()
await migrate(sql)
const app = await buildApp({ sql, logger: true })
await app.listen({ port: config.port, host: config.host })

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close()
    await sql.end()
    process.exit(0)
  })
}
