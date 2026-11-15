import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb } from './db.js'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')

// Применяет по порядку все ещё не применённые файлы migrations/NNN_*.sql
export async function migrate(sql, log = console.log) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
  const done = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name))
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (done.has(f)) continue
    const text = await fs.readFile(path.join(dir, f), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(text)
      await tx`INSERT INTO schema_migrations (name) VALUES (${f})`
    })
    log(`migration applied: ${f}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sql = createDb()
  await migrate(sql)
  await sql.end()
}
