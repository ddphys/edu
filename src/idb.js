// Маленькая обёртка над IndexedDB — хранилищем браузера, куда помещаются файлы
// (в localStorage картинки не влезают). Используется для фото решений ученика
// и для черновика с картинками в редакторе.

export const hasIndexedDb = () => typeof indexedDB !== 'undefined'

const wrap = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

// stores: { имя хранилища: параметры createObjectStore }
export function openDb(name, stores) {
  let promise = null
  const open = () =>
    (promise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => {
        for (const [store, options] of Object.entries(stores))
          if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, options)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }))

  // Одна операция над хранилищем: run получает objectStore и возвращает запрос
  const run = async (store, mode, fn) => {
    const db = await open()
    const tx = db.transaction(store, mode)
    const result = await wrap(fn(tx.objectStore(store)))
    if (mode === 'readwrite')
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = tx.onabort = () => reject(tx.error)
      })
    return result
  }

  return {
    get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
    getAll: (store) => run(store, 'readonly', (s) => s.getAll()),
    keys: (store) => run(store, 'readonly', (s) => s.getAllKeys()),
    put: (store, value, key) => run(store, 'readwrite', (s) => s.put(value, key)),
    delete: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
    clear: (store) => run(store, 'readwrite', (s) => s.clear()),
  }
}
