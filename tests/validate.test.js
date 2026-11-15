import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertContentOk, checkContentDir } from '../scripts/content-fs.js'
import { contentToFiles, toJson } from '../src/content/format.js'
import { errorsOnly, validateContent, warningsOnly } from '../src/content/validate.js'
import { sampleContent } from './helpers.js'

// Меняет образцовый контент и возвращает замечания
function issuesAfter(change) {
  const content = sampleContent()
  change(content.courses[0], content)
  return validateContent(content)
}
const messages = (issues) => issues.map((i) => i.message).join('\n')
const task = (course, n = 0) => (n === 0 ? course.lessons[0].tasks[0] : course.lessons[0].tasks[1].tasks[0])

describe('проверка корректности контента', () => {
  it('образцовый контент без замечаний', () => {
    expect(validateContent(sampleContent())).toEqual([])
  })

  it('повторяющийся id задачи', () => {
    const issues = issuesAfter((c) => (task(c, 1).id = 't1'))
    expect(messages(errorsOnly(issues))).toMatch(/id задачи «t1» повторяется/)
    expect(errorsOnly(issues)[0].path).toBe('courses/0/lessons/0/tasks/1/tasks/0/id')
  })

  it('повторяющиеся id урока и курса', () => {
    expect(messages(issuesAfter((c) => c.lessons.push({ id: 'l1', title: 'Ещё урок' })))).toMatch(/id урока «l1» повторяется/)
    expect(messages(issuesAfter((c, content) => content.courses.push({ ...structuredClone(c) })))).toMatch(/id курса «demo» повторяется/)
  })

  it('id с пробелами или кириллицей', () => {
    expect(messages(issuesAfter((c) => (task(c).id = 'задача 1')))).toMatch(/только латинские буквы/)
    expect(messages(issuesAfter((c) => (c.lessons[0].id = 'урок')))).toMatch(/id урока/)
  })

  it('задача без ответа', () => {
    const issues = issuesAfter((c) => delete task(c).answer)
    expect(messages(issues)).toMatch(/У задачи нет ответа/)
    expect(issues[0].path).toBe('courses/0/lessons/0/tasks/0/answer')
    expect(messages(issuesAfter((c) => (task(c).answer = '8')))).toMatch(/нет ответа/)
    expect(messages(issuesAfter((c) => (task(c, 1).parts[1].answer = null)))).toMatch(/У поля нет ответа/)
  })

  it('задача без условия, отрицательный допуск, уровень вне 1–5, неизвестный тип', () => {
    expect(messages(issuesAfter((c) => (task(c).text = ' ')))).toMatch(/нет условия/)
    expect(messages(issuesAfter((c) => (task(c).tolerance = -1)))).toMatch(/Допуск/)
    expect(messages(issuesAfter((c) => (task(c).level = 7)))).toMatch(/от 1 до 5/)
    expect(messages(issuesAfter((c) => (task(c).type = 'essay')))).toMatch(/Неизвестный тип задачи «essay»/)
  })

  it('ссылка на несуществующую картинку — в условии, подсказке, разборе и вопросе к видео', () => {
    expect(messages(issuesAfter((c) => (task(c).text += '\n\n![Чертёж](net.png)')))).toMatch(/Картинки «net.png» нет в курсе/)
    expect(messages(issuesAfter((c) => (task(c).hints[0] = '![](h.png)')))).toMatch(/«h.png»/)
    expect(messages(issuesAfter((c) => (task(c).solution = '![](s.png)')))).toMatch(/«s.png»/)
    expect(messages(issuesAfter((c) => (c.lessons[0].quiz[0].options[0] = '![](q.png)')))).toMatch(/«q.png»/)
    expect(messages(issuesAfter((c) => (c.cover = 'cover.png')))).toMatch(/«cover.png»/)
  })

  it('картинка из списка курса: ссылка проходит, без размеров — ошибка, неиспользуемая — предупреждение', () => {
    const ok = issuesAfter((c) => {
      c.images = { 'a.png': { w: 100, h: 50 } }
      task(c).text += ' ![Чертёж](a.png|200)'
    })
    expect(ok).toEqual([])
    expect(messages(issuesAfter((c) => {
      c.images = { 'a.png': {} }
      task(c).text += ' ![](a.png)'
    }))).toMatch(/не записан размер/)
    const unused = issuesAfter((c) => (c.images = { 'a.png': { w: 1, h: 1 } }))
    expect(errorsOnly(unused)).toEqual([])
    expect(messages(warningsOnly(unused))).toMatch(/нигде не используется/)
  })

  it('вопрос к видео: верный вариант вне списка, мало вариантов, нет времени', () => {
    const issues = issuesAfter((c) => (c.lessons[0].quiz[0].correct = 3))
    expect(messages(issues)).toMatch(/Номер верного варианта \(4\) вне списка: вариантов всего 3/)
    expect(issues[0].path).toBe('courses/0/lessons/0/quiz/0/correct')
    expect(messages(issuesAfter((c) => delete c.lessons[0].quiz[0].correct))).toMatch(/Не отмечен верный вариант/)
    expect(messages(issuesAfter((c) => (c.lessons[0].quiz[0].options = ['Один'])))).toMatch(/хотя бы два варианта/)
    expect(messages(issuesAfter((c) => (c.lessons[0].quiz[0].time = -5)))).toMatch(/Время вопроса/)
    expect(messages(issuesAfter((c) => (c.lessons[0].quiz[0].options[2] = '')))).toMatch(/Вариант 3 пустой/)
  })

  it('видео: нераспознанная ссылка — ошибка, вопросы без видео — предупреждение', () => {
    expect(messages(errorsOnly(issuesAfter((c) => (c.lessons[0].videoUrl = 'https://example.com/page'))))).toMatch(/не распознана/)
    const noVideo = issuesAfter((c) => (c.lessons[0].videoUrl = ''))
    expect(errorsOnly(noVideo)).toEqual([])
    expect(messages(warningsOnly(noVideo))).toMatch(/вопросы не появятся/)
  })

  it('ошибка в формуле и непарный знак $', () => {
    expect(messages(errorsOnly(issuesAfter((c) => (task(c).text = 'Найдите $\\frac{1}{2$'))))).toMatch(/ошибка в формуле/)
    expect(messages(warningsOnly(issuesAfter((c) => (task(c).text = 'Цена 5$ за штуку'))))).toMatch(/знак \$ без пары/)
  })

  it('настройки XP: цены по уровням и штрафы', () => {
    expect(messages(issuesAfter((c) => (c.levelXp[3] = 0)))).toMatch(/Цена задачи уровня 3/)
    expect(messages(issuesAfter((c) => (c.errorPenalty = 1.5)))).toMatch(/Штраф за ошибку/)
    expect(messages(issuesAfter((c) => delete c.cooldownSeconds))).toMatch(/Длина паузы/)
  })

  it('пустая подсказка, пустая группа, критерии без возможности приложить решение', () => {
    expect(messages(issuesAfter((c) => task(c).hints.push('')))).toMatch(/Подсказка 3 пустая/)
    expect(messages(warningsOnly(issuesAfter((c) => (c.lessons[0].tasks[1].tasks = []))))).toMatch(/В группе нет задач/)
    expect(messages(warningsOnly(issuesAfter((c) => (task(c).rubric = ['Записан второй закон Ньютона']))))).toMatch(/Критерии проверки/)
  })

  it('старый прогресс должен переноситься в существующий курс', () => {
    expect(messages(issuesAfter((c, content) => (content.site.legacyCourse = 'net')))).toMatch(/старый прогресс/)
  })
})

describe('проверка папки с контентом при сборке', () => {
  // Записывает контент во временную папку так же, как он лежит в public/content
  function writeDir(content, patch = () => {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-content-'))
    const files = contentToFiles(content)
    patch(files)
    for (const [rel, value] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      fs.writeFileSync(path.join(dir, rel), typeof value === 'string' ? value : toJson(value))
    }
    return dir
  }

  it('хороший контент проходит', () => {
    expect(() => assertContentOk(writeDir(sampleContent()), () => {})).not.toThrow()
  })

  it('битый контент останавливает сборку с понятным сообщением', () => {
    const content = sampleContent()
    delete content.courses[0].lessons[0].tasks[0].answer
    expect(() => assertContentOk(writeDir(content), () => {})).toThrow(/сайт не собран[\s\S]*задача 1 «t1»: У задачи нет ответа/)
  })

  it('файл, который не читается как JSON', () => {
    const dir = writeDir(sampleContent(), (files) => (files['courses/demo/course.json'] = '{ "id": "demo", '))
    expect(() => assertContentOk(dir, () => {})).toThrow(/courses\/demo\/course.json: не читается как JSON/)
  })

  it('курс из site.json без своей папки', () => {
    const dir = writeDir(sampleContent(), (files) => delete files['courses/demo/course.json'])
    expect(() => assertContentOk(dir, () => {})).toThrow(/Курс «demo» указан в site.json, но файла/)
  })

  it('картинка записана в курсе, но файла нет', () => {
    const content = sampleContent()
    content.courses[0].images = { 'a.png': { w: 10, h: 10 } }
    content.courses[0].lessons[0].tasks[0].text += ' ![](a.png)'
    const { issues } = checkContentDir(writeDir(content))
    expect(messages(errorsOnly(issues))).toMatch(/самого файла нет/)
  })

  it('число подсказок в открытой части расходится с закрытой', () => {
    const dir = writeDir(sampleContent(), (files) => (files['courses/demo/answers.json'].tasks.t1.hints = ['Одна']))
    expect(messages(errorsOnly(checkContentDir(dir).issues))).toMatch(/записано подсказок: 2, а в answers.json их 1/)
  })
})
