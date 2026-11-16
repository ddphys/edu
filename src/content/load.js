// Загрузка контента запросом при открытии страницы (см. объяснение в README, «Как устроен формат»).
// Адреса относительные — сайт работает и в подпапке GitHub Pages, и локально.
import { paths } from './format.js'

const BASE = 'content/'
const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : ''

async function getJson(path) {
  let response
  try {
    response = await fetch(`${BASE}${path}${BUILD ? `?v=${BUILD}` : ''}`)
  } catch {
    throw new Error(`Не удалось загрузить ${path}: нет связи`)
  }
  if (!response.ok) throw new Error(`Не удалось загрузить ${path} (ошибка ${response.status})`)
  return response.json()
}

// Источник контента для страницы ученика. У редактора свой источник — черновик.
export const httpSource = {
  // Открытая часть: сайт и все курсы
  async loadPublic() {
    const site = await getJson(paths.site)
    const courses = await Promise.all((site.courses ?? []).map((id) => getJson(paths.course(id))))
    return { site, courses }
  },
  // Закрытая часть курса. Нужна только локальной проверке ответов; с сервером этот запрос исчезнет.
  loadPrivate: (courseId) => getJson(paths.answers(courseId)),
  imageUrl: (courseId, name) => `${BASE}${paths.image(courseId, name)}`,
}
