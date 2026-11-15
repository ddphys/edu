// Общие заготовки для тестов
import { DEFAULT_XP_RULES } from '../src/lib.js'
import { splitCourse } from '../src/content/format.js'

// Небольшой полный курс: задача с одним ответом, задача с двумя полями, группа, вопрос к видео
export function sampleCourse(overrides = {}) {
  return {
    id: 'demo',
    title: 'Курс',
    teacher: { name: 'Преподаватель' },
    ...structuredClone(DEFAULT_XP_RULES),
    lessons: [
      {
        id: 'l1',
        title: 'Первый урок',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        quiz: [{ time: 10, question: 'Вопрос?', options: ['А', 'Б', 'В'], correct: 1, explain: 'Потому что Б' }],
        tasks: [
          {
            id: 't1',
            type: 'number',
            level: 3,
            title: 'Одно число',
            text: 'Найдите $x$',
            answer: 8,
            hints: ['Первая', 'Вторая'],
            solution: 'Разбор $x = 8$',
          },
          {
            title: 'Группа',
            tasks: [
              {
                id: 't2',
                type: 'number',
                level: 2,
                title: 'Два поля',
                text: 'Найдите время и дальность',
                parts: [
                  { label: 'Время, с', answer: 2 },
                  { label: 'Дальность, м', answer: 34.6, tolerance: 0.1 },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

export const sampleContent = (courseOverrides) => ({
  site: { title: 'Сайт', legacyCourse: 'demo' },
  courses: [sampleCourse(courseOverrides)],
})

// Источник контента для локального api из полного контента (как у предпросмотра в редакторе)
export function sourceOf(content) {
  const parts = Object.fromEntries(content.courses.map((c) => [c.id, splitCourse(c)]))
  return {
    loadPublic: async () => ({
      site: { ...content.site, courses: content.courses.map((c) => c.id) },
      courses: content.courses.map((c) => parts[c.id].course),
    }),
    loadPrivate: async (id) => parts[id].answers,
    imageUrl: (id, name) => `content/courses/${id}/images/${name}`,
  }
}
