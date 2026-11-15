import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Все настройки берутся из переменных окружения (файл server/.env, см. .env.example)
export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/edu',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || 'uploads'),
  // Папка собранного фронтенда (npm run build в корне). Если её нет — сервер отдаёт только API.
  staticDir: path.resolve(root, process.env.STATIC_DIR || '../dist'),
  // На боевом сервере с HTTPS должно быть true
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionDays: Number(process.env.SESSION_DAYS || 60),
  // Открытая регистрация без приглашения
  openRegistration: process.env.OPEN_REGISTRATION !== 'false',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
}
