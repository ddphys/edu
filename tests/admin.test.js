import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { buildArchive, readArchive } from '../src/admin/archive.js'
import { draftIssues } from '../src/admin/issues.js'
import { decorate, imageName, imageUsage, moveByKey, moveItem, newCourse, newLesson, newTask, renameImage } from '../src/admin/model.js'
import { contentToFiles } from '../src/content/format.js'
import { errorsOnly, validateContent } from '../src/content/validate.js'
import { courseTasks } from '../src/lib.js'
import { sampleContent } from './helpers.js'

const png = (text = 'png') => new Blob([text], { type: 'image/png' })

// Черновик: образцовый курс с двумя картинками, одна из них сжата и хранит оригинал
function draft() {
  const content = decorate(sampleContent())
  const course = content.courses[0]
  course.images = { 'scheme.png': { w: 100, h: 50 }, 'photo.jpg': { w: 1600, h: 1200 } }
  course.cover = 'photo.jpg'
  course.lessons[0].tasks[0].text += '\n\n![Чертёж](scheme.png|200)'
  const files = {
    'scheme.png': { blob: png('scheme'), orig: null },
    'photo.jpg': { blob: new Blob(['small'], { type: 'image/jpeg' }), orig: { blob: png('ORIGINAL-BIG'), name: 'Фото доски.PNG' } },
  }
  return { content, course, files }
}

describe('архив для репозитория', () => {
  it('файлы лежат так, как в репозитории: public/content и originals', async () => {
    const { content, files } = draft()
    const zip = unzipSync(new Uint8Array(await (await buildArchive(content, () => files)).arrayBuffer()))
    expect(Object.keys(zip).sort()).toEqual([
      'originals/courses/demo/images/photo.PNG',
      'public/content/courses/demo/answers.json',
      'public/content/courses/demo/course.json',
      'public/content/courses/demo/images/photo.jpg',
      'public/content/courses/demo/images/scheme.png',
      'public/content/site.json',
    ])
    expect(new TextDecoder().decode(zip['public/content/courses/demo/images/scheme.png'])).toBe('scheme')
    expect(new TextDecoder().decode(zip['originals/courses/demo/images/photo.PNG'])).toBe('ORIGINAL-BIG')
  })

  it('служебные поля редактора в архив не попадают, ответы — только в answers.json', async () => {
    const { content, files } = draft()
    const zip = unzipSync(new Uint8Array(await (await buildArchive(content, () => files)).arrayBuffer()))
    const text = (name) => new TextDecoder().decode(zip[name])
    for (const name of Object.keys(zip).filter((n) => n.endsWith('.json'))) expect(text(name)).not.toMatch(/"_key"|"_orig"/)
    expect(text('public/content/courses/demo/course.json')).not.toMatch(/"answer"|"solution"|"hints"/)
    expect(JSON.parse(text('public/content/courses/demo/answers.json')).tasks.t1.answer).toBe(8)
  })

  it('выгрузить и загрузить обратно — тот же контент и те же картинки', async () => {
    const { content, files } = draft()
    const back = await readArchive(await buildArchive(content, () => files))
    expect(contentToFiles(back.content)).toEqual(contentToFiles(content))
    expect(Object.keys(back.images.demo).sort()).toEqual(['photo.jpg', 'scheme.png'])
    expect(await back.images.demo['scheme.png'].blob.text()).toBe('scheme')
    expect(back.images.demo['scheme.png'].blob.type).toBe('image/png')
    expect(back.images.demo['scheme.png'].orig).toBeNull()
    expect(await back.images.demo['photo.jpg'].orig.blob.text()).toBe('ORIGINAL-BIG')
    expect(validateContent(back.content)).toEqual([])
  })

  it('архив, перепакованный вместе с внешней папкой, тоже читается', async () => {
    const { content, files } = draft()
    const { zipSync } = await import('fflate')
    const inner = unzipSync(new Uint8Array(await (await buildArchive(content, () => files)).arrayBuffer()))
    const wrapped = Object.fromEntries(Object.entries(inner).map(([k, v]) => [`edu-content/${k}`, v]))
    wrapped['__MACOSX/edu-content/public/content/site.json'] = new Uint8Array([1, 2, 3])
    const back = await readArchive(new Blob([zipSync(wrapped)]))
    expect(back.content.courses[0].id).toBe('demo')
    expect(Object.keys(back.images.demo)).toHaveLength(2)
  })

  it('понятные сообщения: не архив, чужой архив, потерянная картинка', async () => {
    await expect(readArchive(new Blob(['это не zip']))).rejects.toThrow(/не читается как zip/)
    const { zipSync, strToU8 } = await import('fflate')
    await expect(readArchive(new Blob([zipSync({ 'readme.txt': strToU8('привет') })]))).rejects.toThrow(/нет файла public\/content\/site.json/)
    const { content } = draft()
    await expect(buildArchive(content, () => ({}))).rejects.toThrow(/файл картинки «(scheme.png|photo.jpg)» потерян/)
  })
})

describe('замечания редактора', () => {
  const images = (d) => Object.fromEntries(Object.entries(d.files).map(([name, r]) => [`${d.course._key}/${name}`, r]))

  it('черновик из опубликованного — без замечаний', () => {
    const d = draft()
    expect(draftIssues(d.content, images(d))).toEqual([])
  })

  it('смена id опубликованной задачи — отдельное предупреждение с возвратом', () => {
    const d = draft()
    d.course.lessons[0].tasks[0].id = 't1-new'
    const issues = draftIssues(d.content, images(d))
    expect(errorsOnly(issues)).toEqual([])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'warn', path: 'courses/0/lessons/0/tasks/0/id' })
    expect(issues[0].message).toMatch(/уже опубликована с id «t1».*прогресс учеников по ней обнулится/)
    issues[0].fix.apply(d.content)
    expect(d.course.lessons[0].tasks[0].id).toBe('t1')
  })

  it('то же для задачи в группе, урока и курса', () => {
    const d = draft()
    d.course.lessons[0].tasks[1].tasks[0].id = 'other'
    d.course.lessons[0].id = 'lesson-1'
    d.course.id = 'demo2'
    d.content.site.legacyCourse = 'demo2'
    const issues = draftIssues(d.content, images(d))
    expect(issues.map((i) => i.path).sort()).toEqual(['courses/0/id', 'courses/0/lessons/0/id', 'courses/0/lessons/0/tasks/1/tasks/0/id'])
    for (const issue of issues) issue.fix.apply(d.content)
    expect([d.course.id, d.course.lessons[0].id, d.course.lessons[0].tasks[1].tasks[0].id]).toEqual(['demo', 'l1', 't2'])
  })

  it('новая задача с id, который раньше был у другой, унаследует чужой прогресс', () => {
    const d = draft()
    const lesson = d.course.lessons[0]
    lesson.tasks[0].id = 't1-renamed'
    lesson.tasks.push({ ...newTask(d.course, lesson, 'number'), id: 't1', title: 'Новая', text: 'Условие', answer: 1 })
    const messages = draftIssues(d.content, images(d)).map((i) => i.message).join('\n')
    expect(messages).toMatch(/id «t1» раньше был у другой задачи/)
  })

  it('новая задача и новый урок предупреждений не дают', () => {
    const d = draft()
    const lesson = newLesson(d.course)
    d.course.lessons.push(lesson)
    lesson.tasks.push({ ...newTask(d.course, lesson, 'number'), title: 'Новая', text: 'Условие', answer: 1 })
    expect(draftIssues(d.content, images(d))).toEqual([])
  })

  it('потерянный файл картинки — ошибка, тяжёлый файл — предупреждение', () => {
    const d = draft()
    const all = images(d)
    delete all[`${d.course._key}/scheme.png`]
    all[`${d.course._key}/photo.jpg`] = { blob: new Blob([new Uint8Array(400 * 1024)]), orig: null }
    const issues = draftIssues(d.content, all)
    expect(issues.find((i) => i.level === 'error').message).toMatch(/Файл картинки «scheme.png» потерян/)
    expect(issues.find((i) => i.level === 'warn').message).toMatch(/«photo.jpg» тяжёлая \(400 КБ\)/)
  })
})

describe('модель черновика', () => {
  it('новые id не совпадают ни с существующими, ни с прежними опубликованными', () => {
    const d = draft()
    const lesson = d.course.lessons[0]
    lesson.tasks[0].id = 'renamed' // l1t… свободны, но прежний id t1 занят
    expect(newLesson(d.course).id).toBe('l2')
    expect(newTask(d.course, lesson, 'choice')).toMatchObject({ id: 'l1t1', type: 'choice', options: ['', ''], correct: [] })
    lesson._orig = 'l2'
    expect(newLesson(d.course).id).toBe('l3')
    expect(newCourse(d.content).id).toBe('course-1')
  })

  it('перенос задачи в группу, из группы и перестановка', () => {
    const d = draft()
    const lesson = d.course.lessons[0]
    const [t1, group] = lesson.tasks
    const t2 = group.tasks[0]
    moveItem(lesson, t1._key, { group: group._key, before: t2._key })
    expect(lesson.tasks).toHaveLength(1)
    expect(group.tasks.map((t) => t.id)).toEqual(['t1', 't2'])
    moveItem(lesson, t2._key, { group: null, before: group._key })
    expect(lesson.tasks.map((x) => x.id ?? 'группа')).toEqual(['t2', 'группа'])
    moveItem(lesson, t2._key, { group: null, before: null })
    expect(lesson.tasks.map((x) => x.id ?? 'группа')).toEqual(['группа', 't2'])
    expect(courseTasks(d.course).map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('группу нельзя положить в группу, перенос в никуда ничего не ломает', () => {
    const d = draft()
    const lesson = d.course.lessons[0]
    const before = structuredClone(lesson.tasks)
    const group = lesson.tasks[1]
    moveItem(lesson, group._key, { group: group._key, before: null })
    expect(lesson.tasks).toEqual(before)
    moveItem(lesson, lesson.tasks[0]._key, { group: 'нет-такой', before: null })
    expect(lesson.tasks).toEqual(before)
    moveItem(lesson, 'нет-такого', { group: null, before: null })
    expect(lesson.tasks).toEqual(before)
  })

  it('перестановка уроков по ключу', () => {
    const list = [{ _key: 'a' }, { _key: 'b' }, { _key: 'c' }]
    moveByKey(list, 'c', 'a')
    expect(list.map((x) => x._key)).toEqual(['c', 'a', 'b'])
    moveByKey(list, 'c', null)
    expect(list.map((x) => x._key)).toEqual(['a', 'b', 'c'])
    moveByKey(list, 'b', 'b')
    expect(list.map((x) => x._key)).toEqual(['a', 'b', 'c'])
  })

  it('имя файла картинки: латиница, расширение по типу, без повторов', () => {
    expect(imageName('Схема опыта.PNG', 'image/png')).toBe('shema-opyta.png')
    expect(imageName('IMG_2041.HEIC.jpeg', 'image/jpeg')).toBe('img-2041-heic.jpg')
    expect(imageName('чертёж №2 (финал).svg', 'image/svg+xml')).toBe('chertezh-2-final.svg')
    expect(imageName('', 'image/png')).toBe('image.png')
    expect(imageName('a.png', 'image/png', ['a.png', 'a-2.jpg'])).toBe('a-3.png')
  })

  it('где используется картинка и переименование во всех текстах', () => {
    const d = draft()
    d.course.lessons[0].quiz[0].options[0] = '![](scheme.png)'
    d.course.lessons[0].tasks[0].hints[0] = 'Смотрите ![Чертёж](scheme.png) и не путайте с myscheme.png'
    expect(imageUsage(d.course)).toEqual({ 'photo.jpg': 1, 'scheme.png': 3 })
    renameImage(d.course, 'scheme.png', 'scheme.jpg')
    renameImage(d.course, 'photo.jpg', 'photo.png')
    expect(imageUsage(d.course)).toEqual({ 'photo.png': 1, 'scheme.jpg': 3 })
    expect(d.course.cover).toBe('photo.png')
    expect(Object.keys(d.course.images).sort()).toEqual(['photo.png', 'scheme.jpg'])
    expect(d.course.lessons[0].tasks[0].text).toContain('![Чертёж](scheme.jpg|200)')
    expect(d.course.lessons[0].tasks[0].hints[0]).toContain('myscheme.png')
    expect(validateContent(d.content)).toEqual([])
  })
})
