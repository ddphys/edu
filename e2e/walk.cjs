// Автопроход сайта: открывает собранный сайт в настоящем браузере и проверяет то, что видит человек.
// Запуск: npm run build && npm run e2e. В deploy.yml идёт после сборки — сайт с поломкой не публикуется.
//
// Что проверяется на каждой странице, на компьютере и телефоне, в светлой и тёмной теме:
//   страница открылась и показала своё содержимое; в консоли нет ошибок;
//   ничего не вылезает за экран по ширине; текст на главных кнопках читается (контраст).
// И сценарии: неверный и верный ответ на задачу, журнал попыток, переключатель темы,
// версия для печати, первый ученик и пробник в бланке ЕГЭ, серия заданий в тренажёре «Сила трения».
//
// Курсы и задачи берутся из public/content, поэтому правка контента проверки не ломает.
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium, devices } = require('playwright')

const ROOT = path.join(__dirname, '..')
const PORT = 4179
const BASE = `http://localhost:${PORT}/`

// ---------- что есть на сайте ----------
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/content', file), 'utf8'))
const site = readJson('site.json')
const courses = site.courses.map((id) => ({ ...readJson(`courses/${id}/course.json`), answers: readJson(`courses/${id}/answers.json`).tasks }))
const flat = (lesson) => (lesson.tasks ?? []).flatMap((t) => (Array.isArray(t.tasks) ? t.tasks : [t]))

// Урок с задачами — для страниц урока и печати
const sample = courses.flatMap((course) => (course.lessons ?? []).map((lesson) => ({ course, lesson }))).find((x) => flat(x.lesson).length > 0)
// Задача «одно число», стоящая отдельно (не в группе): на ней проверяем ответы
const solvable = courses
  .flatMap((course) => (course.lessons ?? []).flatMap((lesson) => (lesson.tasks ?? []).map((task) => ({ course, lesson, task }))))
  .find((x) => !Array.isArray(x.task.tasks) && (x.task.type ?? 'number') === 'number' && !x.task.parts && typeof x.course.answers[x.task.id]?.answer === 'number')

const lessonHash = (x) => `#/course/${x.course.id}/lesson/${x.lesson.id}`

// ---------- учёт проверок ----------
const failures = []
let checks = 0
function check(ok, what) {
  checks += 1
  if (!ok) failures.push(what)
}

// ---------- помощники ----------
// Чужие адреса (видео, шрифты) подменяем пустым ответом: проверка не зависит от чужих сайтов
async function newPage(context, where) {
  const page = await context.newPage()
  await page.route(
    (url) => url.hostname !== 'localhost',
    (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }),
  )
  page.on('pageerror', (e) => failures.push(`${where}: ошибка на странице — ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && failures.push(`${where}: ошибка в консоли — ${m.text().slice(0, 200)}`))
  return page
}

async function open(page, hash) {
  await page.goto(BASE + hash)
  await page.waitForLoadState('networkidle')
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

// Контраст текста на главных (залитых) кнопках. Возвращает кнопки, где он ниже 4,5 : 1.
const lowContrast = (page) =>
  page.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const lum = (c) => {
      const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    return [...document.querySelectorAll('.btn--primary, .e-btn--pri, .tr-btn--pri')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const cs = getComputedStyle(el)
        const [a, b] = [lum(rgb(cs.color)), lum(rgb(cs.backgroundColor))]
        return { text: el.textContent.trim().slice(0, 30), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
      })
      .filter((x) => x.ratio < 4.5)
      .map((x) => `«${x.text}» ${x.ratio.toFixed(1)} : 1`)
  })

// ---------- обход страниц ----------
async function walkPages(browser, device, theme) {
  const where0 = `${device.name}, ${theme === 'dark' ? 'тёмная' : 'светлая'} тема`
  const context = await browser.newContext({ ...device.options, colorScheme: theme })
  const pages = [
    ['каталог', '#/', '.catalog .course-card'],
    ['страница курса', `#/course/${sample.course.id}`, '.lessons .lesson-row'],
    ['урок', lessonHash(sample), '#homework .task'],
    ['версия для печати', `${lessonHash(sample)}/print`, '.sheet-task'],
    ['старая ссылка на урок', `#/lesson/${sample.lesson.id}`, '.lesson__head h1'],
    ['несуществующий адрес', '#/course/net-takogo-kursa', '.notfound'],
    ['редактор', '#/admin', '.adm-lesson'],
    ['тренажёры', '#/trainers', '.tr-trainer'],
    ['тренажёр, уровни', '#/trainers/friction', '.tr-level'],
    ['тренажёр, задание', '#/trainers/friction/2', '.tr-task'],
    ['тренажёр, уровень «скоро»', '#/trainers/friction/5', '.tr--page'],
    ['бланк ЕГЭ', '#/ege', '.e-empty'],
    ['бланк ЕГЭ, история', '#/ege/history', '.e-nav'],
    ['бланк ЕГЭ, ученики', '#/ege/students', '.e-nav'],
  ]
  for (const [name, hash, marker] of pages) {
    const where = `${name} (${where0})`
    const page = await newPage(context, where)
    await open(page, hash)
    const shown = await page.locator(marker).first().waitFor({ timeout: 5000 }).then(() => true, () => false)
    check(shown, `${where}: страница не показала содержимое (${marker})`)
    check((await page.evaluate(() => document.documentElement.dataset.theme)) === theme, `${where}: тема не совпала с темой устройства`)
    const extra = await overflow(page)
    check(extra <= 1, `${where}: страница шире экрана на ${extra}px`)
    const low = await lowContrast(page)
    check(low.length === 0, `${where}: текст на кнопке плохо читается — ${low.join('; ')}`)
    await page.close()
  }
  await context.close()
}

// ---------- сценарии ----------
async function solveTask(browser) {
  const where = 'решение задачи'
  if (!solvable) return console.log('  (нет отдельной задачи с одним числом — сценарий с ответами пропущен)')
  const context = await browser.newContext(devices['iPhone 13'])
  const page = await newPage(context, where)
  await open(page, lessonHash(solvable))
  const answer = solvable.course.answers[solvable.task.id].answer
  const card = page.locator('.card', { has: page.locator(`#f-${solvable.task.id}`) })

  await card.locator('input').first().fill(String(answer + 1000))
  await card.locator('button[type=submit]').click()
  check(await card.locator('.msg').filter({ hasText: 'Неверно' }).isVisible(), `${where}: после неверного ответа нет сообщения «Неверно»`)
  check((await card.locator('.result').count()) === 0, `${where}: неверный ответ завершил задачу`)

  await card.locator('input').first().fill(String(answer).replace('.', ','))
  await card.locator('button[type=submit]').click()
  check(await card.locator('.result--ok').isVisible(), `${where}: верный ответ не засчитан`)
  check(/^[1-9]\d* XP/.test((await page.locator('.xp').textContent()).trim()), `${where}: XP в шапке не выросли`)

  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('edu-attempts-v1') ?? '{"events":[]}').events)
  check(events.length === 2 && events[0].kind === 'wrong' && events[0].input[0] === String(answer + 1000) && events[1].kind === 'correct', `${where}: в журнал попыток не попали неверный и верный ответ`)

  await page.reload()
  await page.waitForLoadState('networkidle')
  check(await page.locator('.task-row__mark.is-ok').first().isVisible(), `${where}: после перезагрузки решённая задача не отмечена`)
  await context.close()
}

async function toggleTheme(browser) {
  const where = 'переключатель темы'
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
  const page = await newPage(context, where)
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme)
  await open(page, '#/')
  check((await theme()) === 'light', `${where}: на светлом устройстве сайт не светлый`)
  await page.locator('.theme-btn').click()
  check((await theme()) === 'dark', `${where}: кнопка не включила тёмную тему`)
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check(bg !== 'rgb(246, 247, 251)', `${where}: фон страницы не потемнел`)
  await page.reload()
  check((await theme()) === 'dark', `${where}: выбор темы не сохранился после перезагрузки`)
  await open(page, '#/admin')
  await page.locator('.adm-top .theme-btn').waitFor()
  check((await theme()) === 'dark', `${where}: редактор не подхватил выбранную тему`)
  await page.locator('.adm-top .theme-btn').click()
  check((await theme()) === 'light', `${where}: кнопка в редакторе не вернула светлую тему`)
  await context.close()
}

async function printSheet(browser) {
  const where = 'версия для печати'
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' })
  const page = await newPage(context, where)
  await open(page, lessonHash(sample))
  await page.locator('.print-link').click()
  await page.locator('.sheet-task').first().waitFor()
  const tasks = flat(sample.lesson)
  check((await page.locator('.sheet-task').count()) === tasks.length, `${where}: на листе не все задачи урока (${tasks.length})`)
  check((await page.locator('.sheet input, .sheet .hint, .sheet .solution').count()) === 0, `${where}: на лист попали поля ответа, подсказки или разборы`)
  await page.emulateMedia({ media: 'print' })
  check(await page.locator('.topbar').isHidden(), `${where}: на бумагу попадает шапка сайта`)
  check(await page.locator('.sheet__bar').isHidden(), `${where}: на бумагу попадает кнопка «Напечатать»`)
  const paper = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.sheet__paper')).backgroundColor])
  check(paper.every((c) => c === 'rgb(255, 255, 255)'), `${where}: в тёмной теме лист печатается не на белом (${paper.join(', ')})`)
  await context.close()
}

async function egeBlank(browser) {
  const where = 'бланк ЕГЭ'
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await newPage(context, where)
  await open(page, '#/ege')
  await page.getByRole('button', { name: '+ Ученик' }).click()
  await page.getByPlaceholder('Например, Алина К.').fill('Проверка')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await open(page, '#/ege')
  await page.getByRole('button', { name: '+ Новый пробник' }).click()
  await page.locator('.e-row').first().waitFor()
  check((await page.locator('.e-row').count()) === 26, `${where}: в пробнике не 26 заданий`)
  await page.locator('.e-row').first().locator('.e-pt').last().click()
  // Число в итоге меняется плавно — ждём, пока дойдёт
  const total = page.locator('.e-prim b').filter({ hasText: /^\s*1 из 45\s*$/ })
  check(await total.waitFor({ timeout: 3000 }).then(() => true, () => false), `${where}: балл за задание не попал в итог`)
  const low = await lowContrast(page)
  check(low.length === 0, `${where}: текст на кнопке плохо читается — ${low.join('; ')}`)
  await context.close()
}

// Тренажёр «Сила трения»: из шапки до карты уровней, серия из 10 заданий с ошибками и верными ответами.
// Верный ответ сценарий берёт из кода тренажёра (src/trainers/friction/instance.js) по номеру задания,
// который страница пишет в data-task: так он не зависит от случайного порядка заданий.
async function frictionTrainer(browser) {
  const mod = await import(pathToFileURL(path.join(ROOT, 'src/trainers/friction/instance.js')).href)
  const { TYPES, dirOptions, instanceOf, needsDirection } = mod
  const variants = [
    ['телефон', devices['iPhone 13'], 'light'],
    ['компьютер', { viewport: { width: 1366, height: 850 } }, 'dark'],
  ]
  for (const [name, options, theme] of variants) {
    const where = `тренажёр «Сила трения» (${name}, ${theme === 'dark' ? 'тёмная' : 'светлая'} тема)`
    const context = await browser.newContext({ ...options, colorScheme: theme })
    const page = await newPage(context, where)
    const hosts = new Set()
    page.on('request', (r) => hosts.add(new URL(r.url()).hostname))
    const noOverflow = async (when) => check((await overflow(page)) <= 1, `${where}: ${when} — страница шире экрана`)
    const text = (selector) => page.locator(selector).first().innerText()

    // Кнопка «Тренажёры» в шапке: видна и целиком помещается на экране
    await open(page, '#/')
    const nav = page.locator('.topbar__nav')
    check(await nav.isVisible(), `${where}: в шапке нет кнопки «Тренажёры»`)
    const box = await nav.boundingBox()
    const width = page.viewportSize().width
    check(box && box.x >= 0 && box.x + box.width <= width, `${where}: кнопка «Тренажёры» не помещается в шапку`)
    await nav.click()
    await page.locator('.tr-trainer').waitFor()
    await noOverflow('список тренажёров')
    await page.locator('.tr-trainer').click()
    await page.locator('.tr-level').first().waitFor()
    check((await page.locator('.tr-level').count()) === 7, `${where}: на карте не 7 уровней`)
    check((await page.locator('a.tr-level').count()) === 2, `${where}: открыты не два уровня`)
    check((await page.locator('.tr-level.is-soon').filter({ hasText: 'скоро' }).count()) === 5, `${where}: уровни 3–7 без пометки «скоро»`)
    await page.locator('a.tr-level').first().click()
    await page.locator('.tr-task').waitFor()

    const slot = async () => {
      const el = page.locator('.tr-task')
      return instanceOf({ id: await el.getAttribute('data-task'), mirror: (await el.getAttribute('data-mirror')) === '1', variant: Number(await el.getAttribute('data-variant')) })
    }
    const opt = (i) => page.locator('.tr-opts .tr-opt').nth(i)
    check((await text('.tr-score')).replace(/\s+/g, ' ') === '✓ 0 из 0', `${where}: счётчик в начале серии не «✓ 0 из 0»`)

    const seen = []
    let wrongs = 0
    for (let n = 0; n < 12 && (await page.locator('.tr-sum').count()) === 0; n++) {
      const inst = await slot()
      seen.push(inst.id)
      const typeIndex = TYPES.findIndex((t) => t.code === inst.type)
      if (n === 0) {
        // Неверный тип: сразу карточка разбора, верный вариант подсвечен, на рисунке стрелка трения
        const wrong = TYPES.findIndex((t) => t.code !== inst.type)
        await opt(wrong).click()
        await page.locator('.tr-sheet--bad').waitFor()
        wrongs += 1
        check((await text('.tr-sheet h3')).startsWith('Не совсем'), `${where}: нет заголовка «Не совсем» после ошибки`)
        check((await page.locator('.tr-opt.is-ok').count()) === 1 && (await opt(typeIndex).getAttribute('class')).includes('is-ok'), `${where}: верный тип не подсвечен`)
        check((await page.locator('.tr-task .tr-fric').count()) === (needsDirection(inst.type) ? 1 : 0), `${where}: стрелка трения на рисунке после ошибки`)
        check((await page.locator('.tr-steps').count()) === 0, `${where}: шаги разбора раскрыты до «Не понял»`)
        await page.getByRole('button', { name: 'Не понял' }).click()
        check((await page.locator('.tr-steps li').count()) === 4, `${where}: «Не понял» не раскрыл разбор по шагам`)
        await noOverflow('разбор после ошибки')
        check((await lowContrast(page)).length === 0, `${where}: текст на кнопке плохо читается`)
        await page.locator('.tr-btn--pri').click()
      } else if (n === 2 && needsDirection(inst.type)) {
        // Тип верный, направление — нет
        await opt(typeIndex).click()
        await page.locator('.tr-q small', { hasText: 'Шаг 2 из 2' }).waitFor()
        const options = dirOptions(inst)
        const wrong = options.findIndex((o) => o.code !== inst.dir)
        await opt(wrong).click()
        await page.locator('.tr-sheet--bad').waitFor()
        wrongs += 1
        check((await page.locator('.tr-task .tr-fric').count()) === 1, `${where}: после неверного направления нет стрелки трения`)
        await page.locator('.tr-btn--pri').click()
      } else {
        await opt(typeIndex).click()
        if (needsDirection(inst.type)) {
          await page.locator('.tr-q small', { hasText: 'Шаг 2 из 2' }).waitFor()
          await opt(dirOptions(inst).findIndex((o) => o.code === inst.dir)).click()
        }
        await page.locator('.tr-sheet--ok').waitFor()
        check((await text('.tr-sheet h3')) === 'Верно', `${where}: после верного ответа нет «Верно»`)
        if (n === 1) {
          // Разбор после верного ответа — по желанию
          check((await page.locator('.tr-task .tr-fric').count()) === 0, `${where}: стрелка трения видна до разбора`)
          await page.getByRole('button', { name: 'Показать разбор' }).click()
          check((await page.locator('.tr-steps li').count()) === 4, `${where}: «Показать разбор» не раскрыл шаги`)
          await noOverflow('разбор после верного ответа')
        }
        await page.locator('.tr-btn--pri').click()
      }
      await page.waitForTimeout(30)
    }

    await page.locator('.tr-sum').waitFor({ timeout: 3000 })
    const total = 10 - wrongs
    check((await text('.tr-sum__score')).replace(/\s+/g, ' ') === `✓ ${total} из 10`, `${where}: итог серии не «✓ ${total} из 10» (ошибок было ${wrongs})`)
    check(seen.length === 10, `${where}: в серии ${seen.length} заданий, а не 10`)
    check(seen.slice(1).includes(seen[0]), `${where}: ситуация с ошибкой не повторилась в серии`)
    check((await page.getByRole('button', { name: 'Ещё серия' }).count()) === 1 && (await page.locator('.tr-btn--link').filter({ hasText: 'К уровням' }).count()) === 1, `${where}: в итоге нет кнопок «Ещё серия» и «К уровням»`)
    await noOverflow('итог серии')
    check((await lowContrast(page)).length === 0, `${where}: текст на кнопке итога плохо читается`)

    const events = await page.evaluate(() => JSON.parse(localStorage.getItem('edu-attempts-v1') ?? '{"events":[]}').events.filter((e) => e.course === 'trainer-friction'))
    check(events.length === 10 && events.filter((e) => e.kind === 'wrong').length === wrongs && events[0].kind === 'wrong' && events[0].task === seen[0], `${where}: в журнал попыток не попали ответы серии (${events.length})`)

    // Шрифты тренажёра — с самого сайта, без запросов к другим адресам
    const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))
    check(fonts.includes('Manrope'), `${where}: шрифт Manrope не загрузился`)
    check(fonts.some((f) => f.startsWith('STIX')), `${where}: шрифт STIX Two Text не загрузился`)
    const foreign = [...hosts].filter((h) => h && h !== 'localhost')
    check(foreign.length === 0, `${where}: тренажёр обращается к чужим адресам: ${foreign.join(', ')}`)

    await page.getByRole('button', { name: 'Ещё серия' }).click()
    await page.locator('.tr-task').waitFor()
    check((await text('.tr-score')).replace(/\s+/g, ' ') === '✓ 0 из 0', `${where}: «Ещё серия» не начала новую серию`)
    await page.locator('.tr-x').click()
    await page.locator('.tr-levels').waitFor()
    await context.close()
  }
}

// ---------- запуск ----------
async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {
      /* ещё не поднялся */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Сайт не запустился. Сначала соберите его: npm run build')
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) throw new Error('Нет папки dist. Сначала соберите сайт: npm run build')
  if (!sample) throw new Error('В public/content нет ни одного урока с задачами — проверять нечего')
  const vite = path.join(ROOT, 'node_modules/vite/bin/vite.js')
  const server = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  let browser
  try {
    await waitForServer()
    browser = await chromium.launch()
    const sizes = [
      { name: 'компьютер', options: { viewport: { width: 1366, height: 850 } } },
      { name: 'телефон', options: devices['iPhone 13'] },
    ]
    for (const device of sizes) for (const theme of ['light', 'dark']) await walkPages(browser, device, theme)
    for (const scenario of [solveTask, toggleTheme, printSheet, egeBlank, frictionTrainer]) {
      try {
        await scenario(browser)
      } catch (e) {
        failures.push(`${scenario.name}: сценарий оборвался — ${e.message.split('\n')[0]}`)
      }
    }
  } finally {
    await browser?.close()
    server.kill()
  }

  if (failures.length) {
    console.error(`\nАвтопроход сайта: найдено проблем — ${failures.length}\n`)
    for (const f of failures) console.error(`  ✗ ${f}`)
    process.exit(1)
  }
  console.log(`Автопроход сайта: всё в порядке (проверок: ${checks}).`)
}

main().catch((e) => {
  console.error(`Автопроход сайта не запустился: ${e.message}`)
  process.exit(1)
})
