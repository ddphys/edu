// Хранилище бланка ЕГЭ, пока у сайта нет сервера.
//
// Интерфейс, с которым работают страницы (его же должна дать будущая серверная версия):
//   subscribe(fn) → отписка;  getSnapshot() → { status, students, exams, file, notice }
//   put(kind, record)  — сохранить ученика ('students') или пробник ('exams'), record.id обязателен
//   remove(kind, id)   — удалить запись
//   flush()            — дописать всё несохранённое прямо сейчас
//   file               — только у локальной версии: файл данных, копии (на сервере его нет)
//
// Локальная версия: все данные в памяти, копия в localStorage пишется сразу после каждого изменения
// (так последний балл переживает закрытие вкладки). Если подключён файл данных (Chrome / Edge
// на компьютере, File System Access API), он перезаписывается через 350 мс после изменения
// и сразу при уходе со страницы. Копии сливаются по времени изменения записи (data.js).
import { openDb } from '../idb.js'
import { blank, count, merge, norm, parseText, serialize, toLists } from './data.js'

export const LS_KEY = 'ege-blank-data-v1'
const WRITE_DELAY = 350
const TYPES = [{ description: 'Данные бланка', accept: { 'application/json': ['.json'] } }]

export function createLocalEgeStore({ storage = globalThis.localStorage, win = globalThis.window, idb = null } = {}) {
  const fsSupported = !!win && typeof win.showSaveFilePicker === 'function' && typeof win.showOpenFilePicker === 'function'
  const kv = idb ?? (fsSupported && typeof indexedDB !== 'undefined' ? openDb('ege-blank', { kv: undefined }) : null)

  let data = blank()
  let status = 'loading' // loading | ok | saving | err
  let handle = null
  let fileState = fsSupported ? 'none' : 'unsupported' // none | ready | needsperm | lost | unsupported
  let fileName = ''
  let notice = null
  let noticeId = 0
  let chain = Promise.resolve()
  let timer = null
  let warned = false
  let snap = null
  const listeners = new Set()

  const say = (text) => (notice = { id: ++noticeId, text })

  function emit() {
    snap = null
    for (const fn of [...listeners]) fn()
  }

  function lsSave() {
    try {
      storage?.setItem(LS_KEY, serialize(data))
    } catch {
      /* переполнено или запрещено: файл и память всё равно есть */
    }
  }
  function lsLoad() {
    try {
      const t = storage?.getItem(LS_KEY)
      if (t) data = merge(data, norm(JSON.parse(t)))
    } catch {
      /* битая копия в браузере: начинаем с того, что есть */
    }
  }

  // Записать текущее состояние в файл. Записи идут строго по очереди.
  function writeFile() {
    clearTimeout(timer)
    timer = null
    if (!handle || fileState !== 'ready') return Promise.resolve()
    const text = serialize(data)
    const h = handle
    const p = chain
      .catch(() => {})
      .then(async () => {
        const w = await h.createWritable()
        await w.write(text)
        await w.close()
      })
    chain = p
    return p.then(
      () => {
        warned = false
        if (!timer && chain === p) status = 'ok'
        emit()
      },
      () => {
        status = 'err'
        if (!warned) {
          warned = true
          say(`Не получилось записать в файл «${fileName}». Данные пока сохранены в браузере.`)
        }
        emit()
      },
    )
  }

  function changed() {
    lsSave()
    if (handle && fileState === 'ready') {
      status = 'saving'
      clearTimeout(timer)
      timer = setTimeout(writeFile, WRITE_DELAY)
    } else status = 'ok'
    emit()
  }

  // Прочитать файл, слить с тем, что уже есть в браузере, и записать объединение обратно.
  // Так подключение файла не затирает баллы, введённые до него.
  async function syncFrom() {
    const inc = parseText(await (await handle.getFile()).text())
    fileState = 'ready'
    if (inc) {
      data = merge(data, inc)
      lsSave()
    }
    await writeFile()
    return inc && count(inc) ? 'merged' : 'written'
  }

  async function attach(h) {
    const prev = { handle, fileName, fileState }
    handle = h
    fileName = h.name || 'файл'
    let r
    try {
      r = await syncFrom()
    } catch (e) {
      ;({ handle, fileName, fileState } = prev)
      emit()
      throw e
    }
    try {
      await kv?.put('kv', h, 'handle')
    } catch {
      /* не запомнили файл: в следующий раз его откроют вручную */
    }
    say(r === 'merged' ? 'Файл подключён, данные из него загружены' : 'Файл создан, данные записаны')
    emit()
  }

  async function restore() {
    if (!fsSupported || !kv) return
    let h = null
    try {
      h = await kv.get('kv', 'handle')
    } catch {
      /* нет сохранённого файла */
    }
    if (!h) return
    handle = h
    fileName = h.name || 'файл'
    let perm = 'prompt'
    try {
      perm = await h.queryPermission({ mode: 'readwrite' })
    } catch {
      /* старый браузер */
    }
    if (perm !== 'granted') {
      fileState = 'needsperm'
      return
    }
    try {
      await syncFrom()
    } catch {
      fileState = 'lost'
    }
  }

  // Ошибки выбора файла: отмена молча, чужой файл не трогаем
  function fileError(e) {
    if (e?.name === 'AbortError') return
    say(e instanceof SyntaxError ? 'Это не файл данных бланка, он не тронут' : 'Не получилось подключить файл')
    emit()
  }

  const file = {
    supported: fsSupported,
    async create() {
      try {
        await attach(await win.showSaveFilePicker({ suggestedName: 'ege-данные.json', types: TYPES }))
      } catch (e) {
        fileError(e)
      }
    },
    async open() {
      try {
        const [h] = await win.showOpenFilePicker({ types: TYPES, multiple: false })
        await attach(h)
      } catch (e) {
        fileError(e)
      }
    },
    async reconnect() {
      try {
        if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return
        await syncFrom()
        say('Файл подключён')
        emit()
      } catch (e) {
        fileState = e instanceof SyntaxError ? 'needsperm' : 'lost'
        emit()
        fileError(e)
      }
    },
    // Текст резервной копии
    exportText: () => serialize(data),
    // Влить копию из файла. Возвращает, сколько добавилось, или бросает ошибку с текстом для человека.
    importText(text) {
      let inc
      try {
        inc = parseText(text)
      } catch {
        throw new Error('Это не файл данных бланка')
      }
      if (!inc || !count(inc)) throw new Error('В файле нет учеников и пробников')
      const students = Object.keys(inc.students).filter((id) => !data.students[id]).length
      const exams = Object.keys(inc.exams).filter((id) => !data.exams[id]).length
      data = merge(data, inc)
      changed()
      return { students, exams }
    },
  }

  // Другая вкладка с бланком что-то сохранила: берём к себе
  win?.addEventListener?.('storage', (ev) => {
    if (ev.key !== LS_KEY || !ev.newValue) return
    try {
      data = merge(data, norm(JSON.parse(ev.newValue)))
      emit()
    } catch {
      /* битая запись другой вкладки */
    }
  })
  // Уход со страницы: файл дописывается сразу, без задержки
  const flushNow = () => {
    if (timer) writeFile()
  }
  win?.addEventListener?.('pagehide', flushNow)
  win?.document?.addEventListener?.('visibilitychange', () => {
    if (win.document.visibilityState === 'hidden') flushNow()
  })

  const ready = (async () => {
    lsLoad()
    try {
      await restore()
    } catch {
      /* файл недоступен: работаем с браузером */
    }
  })().then(() => {
    if (status === 'loading') status = 'ok'
    emit()
  })

  return {
    ready,
    file,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getSnapshot() {
      if (!snap) snap = { status, ...toLists(data), file: { state: fileState, name: fileName }, notice }
      return snap
    },
    put(kind, record) {
      const { id, ...rest } = record
      data[kind][id] = { ...structuredClone(rest), _t: Date.now() }
      delete data.deleted[`${kind}/${id}`]
      changed()
    },
    remove(kind, id) {
      delete data[kind][id]
      data.deleted[`${kind}/${id}`] = Date.now()
      changed()
    },
    flush: flushNow,
  }
}
