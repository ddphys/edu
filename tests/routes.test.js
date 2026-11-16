import { describe, expect, it } from 'vitest'
import { href, legacyTarget, parseRoute } from '../src/routes.js'
import { checkContentDir } from '../scripts/content-fs.js'

describe('адреса страниц', () => {
  it('каталог', () => {
    for (const hash of ['', '#', '#/', '#//']) expect(parseRoute(hash)).toEqual({ page: 'catalog' })
  })

  it('курс, урок, редактор', () => {
    expect(parseRoute('#/course/physics')).toEqual({ page: 'course', courseId: 'physics' })
    expect(parseRoute('#/course/physics/')).toEqual({ page: 'course', courseId: 'physics' })
    expect(parseRoute('#/course/physics/lesson/l1')).toEqual({ page: 'lesson', courseId: 'physics', lessonId: 'l1' })
    expect(parseRoute('#/course/physics/lesson/l1/print')).toEqual({ page: 'print', courseId: 'physics', lessonId: 'l1' })
    expect(parseRoute('#/admin')).toEqual({ page: 'admin' })
    expect(parseRoute('#/admin/')).toEqual({ page: 'admin' })
  })

  it('бланк ЕГЭ', () => {
    expect(parseRoute('#/ege')).toEqual({ page: 'ege', view: 'check' })
    expect(parseRoute('#/ege/')).toEqual({ page: 'ege', view: 'check' })
    expect(parseRoute('#/ege/history')).toEqual({ page: 'ege', view: 'history' })
    expect(parseRoute('#/ege/students')).toEqual({ page: 'ege', view: 'students' })
    for (const v of ['check', 'history', 'students']) expect(parseRoute(href.ege(v))).toEqual({ page: 'ege', view: v })
  })

  it('тренажёры', () => {
    expect(parseRoute('#/trainers')).toEqual({ page: 'trainers', view: 'list' })
    expect(parseRoute('#/trainers/')).toEqual({ page: 'trainers', view: 'list' })
    expect(parseRoute('#/trainers/friction')).toEqual({ page: 'trainers', view: 'levels', trainer: 'friction' })
    expect(parseRoute('#/trainers/friction/1')).toEqual({ page: 'trainers', view: 'play', trainer: 'friction', level: 1 })
    expect(parseRoute('#/trainers/friction/7')).toEqual({ page: 'trainers', view: 'play', trainer: 'friction', level: 7 })
    expect(parseRoute(href.trainers())).toEqual({ page: 'trainers', view: 'list' })
    expect(parseRoute(href.trainer('friction'))).toEqual({ page: 'trainers', view: 'levels', trainer: 'friction' })
    expect(parseRoute(href.trainerLevel('friction', 2))).toEqual({ page: 'trainers', view: 'play', trainer: 'friction', level: 2 })
  })

  it('старая ссылка на урок', () => {
    expect(parseRoute('#/lesson/l1')).toEqual({ page: 'legacy-lesson', lessonId: 'l1' })
  })

  it('непонятный адрес', () => {
    for (const hash of ['#/что-то', '#/course', '#/course/a/b', '#/course/a/lesson', '#/course/a/lesson/b/c', '#/course/a/lesson/b/print/x', '#/lesson', '#/admin/x', '#/ege/x', '#/ege/check', '#/ege/history/1',
      '#/trainers/net', '#/trainers/friction/0', '#/trainers/friction/8', '#/trainers/friction/x', '#/trainers/friction/1/2', '#/trainers/toString'])
      expect(parseRoute(hash)).toEqual({ page: 'unknown' })
  })

  it('ссылки читаются обратно', () => {
    expect(parseRoute(href.catalog())).toEqual({ page: 'catalog' })
    expect(parseRoute(href.course('demo'))).toEqual({ page: 'course', courseId: 'demo' })
    expect(parseRoute(href.lesson('demo', 'l-1'))).toEqual({ page: 'lesson', courseId: 'demo', lessonId: 'l-1' })
    expect(parseRoute(href.print('demo', 'l-1'))).toEqual({ page: 'print', courseId: 'demo', lessonId: 'l-1' })
    expect(parseRoute(href.admin())).toEqual({ page: 'admin' })
  })
})

describe('старые ссылки #/lesson/<урок>', () => {
  const content = {
    site: { legacyCourse: 'old' },
    courses: [
      { id: 'new', lessons: [{ id: 'l1' }, { id: 'intro' }] },
      { id: 'old', lessons: [{ id: 'l1' }, { id: 'l2' }] },
    ],
  }

  it('ведут в курс, который раньше был единственным', () => {
    expect(legacyTarget('l1', content)).toBe('#/course/old/lesson/l1')
    expect(legacyTarget('l2', content)).toBe('#/course/old/lesson/l2')
  })

  it('урок есть только в другом курсе — ведут туда; нигде нет — null', () => {
    expect(legacyTarget('intro', content)).toBe('#/course/new/lesson/intro')
    expect(legacyTarget('net', content)).toBeNull()
    expect(legacyTarget('l1', { site: {}, courses: [] })).toBeNull()
  })

  it('все старые ссылки опубликованного курса открываются', () => {
    const { content: published } = checkContentDir()
    for (const id of ['l1', 'l2', 'l3']) expect(legacyTarget(id, published)).toBe(`#/course/physics-olymp-10-11/lesson/${id}`)
  })
})
