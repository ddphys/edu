import { describe, expect, it } from 'vitest'
import { contentToFiles, filesToContent, mergeCourse, splitCourse, toJson } from '../src/content/format.js'
import { checkContentDir } from '../scripts/content-fs.js'
import { allTasks, courseTasks } from '../src/lib.js'
import { sampleContent, sampleCourse } from './helpers.js'

describe('формат контента: открытая и закрытая части', () => {
  it('в открытой части нет ответов, подсказок и разборов', () => {
    const { course } = splitCourse(sampleCourse())
    const text = JSON.stringify(course)
    for (const secret of ['"answer"', '"tolerance"', '"hints"', '"solution"', '"correct"', '"explain"', 'Потому что', 'Разбор', 'Первая'])
      expect(text).not.toContain(secret)
  })

  it('в открытой части остаётся то, что нужно до ответа: условие, тип, подписи полей, число подсказок', () => {
    const { course } = splitCourse(sampleCourse())
    const [t1, t2] = courseTasks(course)
    expect(t1).toEqual({ id: 't1', type: 'number', level: 3, title: 'Одно число', text: 'Найдите $x$', hintCount: 2 })
    expect(t2.parts).toEqual([{ label: 'Время, с' }, { label: 'Дальность, м' }])
    expect(course.lessons[0].quiz).toEqual([{ time: 10, question: 'Вопрос?', options: ['А', 'Б', 'В'] }])
  })

  it('закрытая часть хранит ответы по id задач и ответы на вопросы по id урока', () => {
    const { answers } = splitCourse(sampleCourse())
    expect(answers.tasks.t1).toEqual({ answer: 8, hints: ['Первая', 'Вторая'], solution: 'Разбор $x = 8$' })
    expect(answers.tasks.t2).toEqual({ parts: [{ answer: 2 }, { answer: 34.6, tolerance: 0.1 }] })
    expect(answers.quiz).toEqual({ l1: [{ correct: 1, explain: 'Потому что Б' }] })
  })

  it('разрезать и собрать обратно — получится тот же курс', () => {
    const full = sampleCourse()
    const { course, answers } = splitCourse(full)
    expect(mergeCourse(course, answers)).toEqual(full)
  })

  it('служебные поля редактора (с подчёркиванием) в файлы не попадают', () => {
    const full = sampleCourse({ _orig: 'demo' })
    full.lessons[0]._key = 'k1'
    full.lessons[0].tasks[0]._orig = 't1'
    const files = contentToFiles({ site: { title: 'Сайт', _x: 1 }, courses: [full] })
    expect(toJson(files)).not.toMatch(/"_\w+"/)
  })

  it('весь контент превращается в файлы и читается обратно', () => {
    const content = sampleContent()
    const files = contentToFiles(content)
    expect(Object.keys(files)).toEqual(['site.json', 'courses/demo/course.json', 'courses/demo/answers.json'])
    expect(files['site.json'].courses).toEqual(['demo'])
    const back = filesToContent((path) => JSON.parse(JSON.stringify(files[path])))
    expect(back).toEqual(content)
  })

  it('без закрытой части курс собирается без ответов (так его будет видеть ученик с сервером)', () => {
    const { course } = splitCourse(sampleCourse())
    const merged = mergeCourse(course)
    expect(courseTasks(merged)[0].answer).toBeUndefined()
    expect(merged.lessons[0].quiz[0].correct).toBeUndefined()
  })
})

describe('опубликованный контент (public/content)', () => {
  const { content, issues } = checkContentDir()

  it('проходит проверку без ошибок', () => {
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
  })

  it('старый курс перенесён с теми же id: 3 урока, 7 задач, вопрос к видео', () => {
    const course = content.courses.find((c) => c.id === 'physics-olymp-10-11')
    expect(course.lessons.map((l) => l.id)).toEqual(['l1', 'l2', 'l3'])
    expect(courseTasks(course).map((t) => t.id)).toEqual(['l1t1', 'l1t2', 'l1t3', 'l2t1', 'l2t2', 'l3t1', 'l3t2'])
    expect(courseTasks(course).map((t) => t.answer)).toEqual([8, -6, 25, 5, 50, 9, 20])
    expect(course.lessons[0].quiz).toHaveLength(1)
    expect(course.lessons[0].quiz[0].correct).toBe(1)
    // l1t2 и l1t3 собраны в группу
    expect(course.lessons[0].tasks[1].title).toBe('Тренировочные задачи')
    expect(allTasks(course.lessons[0])).toHaveLength(3)
  })

  it('старый прогресс переносится в существующий курс', () => {
    expect(content.courses.map((c) => c.id)).toContain(content.site.legacyCourse)
  })
})
