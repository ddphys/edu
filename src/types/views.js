// Отображения типов задач у ученика. Файл View.jsx в папке типа подхватывается сам.
const modules = import.meta.glob('./*/View.jsx', { eager: true })

export const views = Object.fromEntries(Object.entries(modules).map(([path, m]) => [path.split('/')[1], m.default]))
