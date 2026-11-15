// Ошибка с HTTP-кодом и понятным пользователю текстом
export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

export const fail = (code, message) => {
  throw new HttpError(code, message)
}

export const toInt = (v) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : fail(400, 'Неверный идентификатор')
}

export const str = (v, { max = 100000, required = false, name = 'Поле' } = {}) => {
  if (v === undefined || v === null) return required ? fail(400, `${name}: обязательно`) : undefined
  if (typeof v !== 'string') fail(400, `${name}: ожидается строка`)
  if (required && !v.trim()) fail(400, `${name}: обязательно`)
  if (v.length > max) fail(400, `${name}: слишком длинно`)
  return v
}

export const intList = (v, name = 'Список') => {
  if (!Array.isArray(v)) fail(400, `${name}: ожидается список`)
  return v.map(toInt)
}
