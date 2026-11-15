import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { config } from '../config.js'

const scrypt = promisify(crypto.scrypt)
const KEYLEN = 64
const PARAMS = { N: 16384, r: 8, p: 1 }

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, KEYLEN, PARAMS)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored).split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, PARAMS)
  return crypto.timingSafeEqual(key, expected)
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')

export const COOKIE = 'sid'

export async function createSession(sql, userId) {
  const token = randomToken()
  const expires = new Date(Date.now() + config.sessionDays * 864e5)
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${sha256(token)}, ${userId}, ${expires})`
  return { token, expires }
}

export function setSessionCookie(reply, { token, expires }) {
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    expires,
  })
}

export const publicUser = (u) =>
  u && {
    id: u.id,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    role: u.role,
  }

export const isStaff = (u) => u?.role === 'admin' || u?.role === 'teacher'

export function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Пароль должен быть не короче 8 символов'
  if (p.length > 200) return 'Слишком длинный пароль'
  return null
}

export const normEmail = (e) => String(e ?? '').trim().toLowerCase()
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200
