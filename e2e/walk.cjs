// Автопроход сайта: открывает собранный сайт в настоящем браузере и проверяет то, что видит человек.
// Запуск: npm run build && npm run e2e. В deploy.yml идёт после сборки — сайт с поломкой не публикуется.
//
// Что проверяется на каждой странице, на компьютере и телефоне, в светлой и тёмной теме:
//   страница открылась и показала своё содержимое; в консоли нет ошибок;
//   ничего не вылезает за экран по ширине; текст на главных кнопках читается (контраст).
// И сценарии: неверный и верный ответ на задачу, журнал попыток, переключатель темы,
// версия для печати, первый ученик и пробник в бланке ЕГЭ.
//
// Курсы и задачи берутся из public/content, поэтому правка контента проверки не ломает.
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
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
    return [...document.querySelectorAll('.btn--primary, .e-btn--pri')]
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
    for (const scenario of [solveTask, toggleTheme, printSheet, egeBlank]) {
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
