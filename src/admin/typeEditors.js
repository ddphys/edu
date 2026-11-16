// Формы типов задач в редакторе. Файл Editor.jsx в папке типа подхватывается сам.
const modules = import.meta.glob('../types/*/Editor.jsx', { eager: true })

export const typeEditors = Object.fromEntries(Object.entries(modules).map(([path, m]) => [path.split('/')[2], m.default]))
