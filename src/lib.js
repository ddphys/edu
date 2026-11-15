// ---------- Rutube ----------
// Принимает ссылку любого вида (video / play/embed) или просто id, возвращает ссылку для iframe.
export function rutubeEmbedUrl(input) {
  if (!input) return null
  const m = String(input).match(/[0-9a-f]{32}/i)
  return m ? `https://rutube.ru/play/embed/${m[0].toLowerCase()}` : null
}

// Логика проверки ответов и XP теперь на сервере: server/src/lib/tasks.js
