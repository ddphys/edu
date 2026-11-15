// Обращения к серверу. Все запросы идут на тот же адрес, что и сайт (/api/...).
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: {} }
  if (body instanceof FormData) opts.body = body
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(url, opts)
  } catch {
    throw new ApiError(0, 'Нет связи с сервером')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || `Ошибка ${res.status}`)
  return data
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  patch: (u, b) => request('PATCH', u, b),
  put: (u, b) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
  upload: (u, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return request('POST', u, fd)
  },
}
