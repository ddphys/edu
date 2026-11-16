// Светлая и тёмная тема. По умолчанию — как на устройстве; кнопка в шапке меняет её вручную,
// выбор хранится в браузере (ключ edu-theme). Включённая тема записана в <html data-theme>,
// по ней стили подставляют палитру (styles.css, admin.css, ege.css).
// Первый раз атрибут ставит маленький скрипт в index.html — до отрисовки, чтобы страница не мигала.
import { useSyncExternalStore } from 'react'

const KEY = 'edu-theme'
const EVENT = 'edu-theme-change'

const media = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null)
const deviceTheme = () => (media()?.matches ? 'dark' : 'light')

function savedTheme() {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export const currentTheme = () => savedTheme() ?? deviceTheme()

function apply() {
  document.documentElement.dataset.theme = currentTheme()
}

// Выбрать тему вручную. Если она совпала с темой устройства, выбор забывается:
// сайт снова следует за устройством (например, темнеет вечером вместе с телефоном).
export function chooseTheme(theme) {
  try {
    if (theme === deviceTheme()) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    /* хранилище недоступно — тема сменится до перезагрузки страницы */
    document.documentElement.dataset.theme = theme
    window.dispatchEvent(new Event(EVENT))
    return
  }
  apply()
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(onChange) {
  const update = () => {
    apply()
    onChange()
  }
  // Тему могли сменить на устройстве или в соседней вкладке
  media()?.addEventListener('change', update)
  window.addEventListener('storage', update)
  window.addEventListener(EVENT, onChange)
  return () => {
    media()?.removeEventListener('change', update)
    window.removeEventListener('storage', update)
    window.removeEventListener(EVENT, onChange)
  }
}

// Тема, которая сейчас на экране: 'light' или 'dark'
export const useTheme = () => useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme ?? 'light')
