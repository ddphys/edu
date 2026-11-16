// Адрес страницы хранится в хэше — так сайт работает на GitHub Pages в подпапке,
// работает кнопка «Назад» и ссылку на урок можно переслать.
//   #/                              — каталог курсов
//   #/course/<курс>                 — страница курса со списком уроков
//   #/course/<курс>/lesson/<урок>   — урок
//   #/admin                         — редактор курса
//   #/lesson/<урок>                 — старая ссылка (когда курс был один): перенаправляется на новую

const decode = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function parseRoute(hash) {
  const parts = String(hash ?? '')
    .replace(/^#/, '')
    .split('/')
    .filter(Boolean)
    .map(decode)
  if (parts.length === 0) return { page: 'catalog' }
  if (parts[0] === 'admin' && parts.length === 1) return { page: 'admin' }
  if (parts[0] === 'course' && parts.length === 2) return { page: 'course', courseId: parts[1] }
  if (parts[0] === 'course' && parts[2] === 'lesson' && parts.length === 4) return { page: 'lesson', courseId: parts[1], lessonId: parts[3] }
  if (parts[0] === 'lesson' && parts.length === 2) return { page: 'legacy-lesson', lessonId: parts[1] }
  return { page: 'unknown' }
}

export const href = {
  catalog: () => '#/',
  course: (courseId) => `#/course/${encodeURIComponent(courseId)}`,
  lesson: (courseId, lessonId) => `#/course/${encodeURIComponent(courseId)}/lesson/${encodeURIComponent(lessonId)}`,
  admin: () => '#/admin',
}

// Куда ведёт старая ссылка #/lesson/<урок>. Сначала урок ищется в курсе, который был единственным
// (site.legacyCourse), потом в остальных. Если такого урока нет нигде — null.
export function legacyTarget(lessonId, content) {
  const courses = content?.courses ?? []
  const legacy = content?.site?.legacyCourse
  const ordered = [...courses.filter((c) => c.id === legacy), ...courses.filter((c) => c.id !== legacy)]
  const course = ordered.find((c) => (c.lessons ?? []).some((l) => l.id === lessonId))
  return course ? href.lesson(course.id, lessonId) : null
}
