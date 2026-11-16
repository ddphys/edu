import { Area, Check, Field, Num, Select, Text, useAdmin } from './fields.jsx'
import { shift } from './model.js'

// Настройки курса: название, описание, преподаватель, цены по уровням, штрафы
export function CourseEditor({ ci }) {
  const { content, update, courseImages } = useAdmin()
  const course = content.courses[ci]
  const path = `courses/${ci}`
  const change = (fn) => update((c) => fn(c.courses[ci]))
  const imageOptions = [['', '— нет —'], ...courseImages.map((i) => [i.name, i.name])]
  const photo = course.teacher?.photo ?? ''
  const photoIsLink = /^https?:\/\//.test(photo)

  return (
    <div className="adm-form">
      <section className="adm-card">
        <h2>Настройки курса</h2>
        <div className="adm-row adm-row--title">
          <Text label="Название курса" path={`${path}/title`} value={course.title} onChange={(v) => change((c) => void (c.title = v))} />
          <Text label="id курса" path={`${path}/id`} hint="Имя папки курса и часть адреса" value={course.id} onChange={(v) => change((c) => void (c.id = v.trim()))} />
        </div>
        <Text label="Строка над названием" path={`${path}/badge`} hint="Например: «У вас доступ к бесплатным занятиям»" value={course.badge} onChange={(v) => change((c) => void (c.badge = v))} />
        <Area label="Описание курса" path={`${path}/about`} value={course.about} onChange={(v) => change((c) => void (c.about = v))} />
        <Select
          label="Обложка в каталоге"
          path={`${path}/cover`}
          hint="Картинка из раздела «Картинки». Лучше всего смотрится горизонтальная, 16:9. Без обложки показывается цветная плашка."
          value={course.cover ?? ''}
          onChange={(v) => change((c) => void (v ? (c.cover = v) : delete c.cover))}
          options={imageOptions}
        />
      </section>

      <section className="adm-card">
        <h3>Преподаватель</h3>
        <div className="adm-row">
          <Text label="Имя" path={`${path}/teacher/name`} value={course.teacher?.name} onChange={(v) => change((c) => void (c.teacher = { ...c.teacher, name: v }))} />
          <Select
            label="Фото"
            path={`${path}/teacher/photo`}
            hint="Картинка курса. Без фото показывается первая буква имени."
            value={photoIsLink ? '' : photo}
            onChange={(v) => change((c) => void (c.teacher = { ...c.teacher, photo: v }))}
            options={imageOptions}
          />
        </div>
        {photoIsLink && <div className="adm-hint">Сейчас фото задано ссылкой: {photo}</div>}
      </section>

      <section className="adm-card">
        <h3>Цена задач по сложности, XP</h3>
        <div className="adm-row adm-row--5">
          {[1, 2, 3, 4, 5].map((level) => (
            <Num key={level} label={`Уровень ${level}`} path={`${path}/levelXp/${level}`} value={course.levelXp?.[level]} onChange={(v) => change((c) => void (c.levelXp = { ...c.levelXp, [level]: v }))} />
          ))}
        </div>
        <Select
          label="Уровень задачи, если он не указан"
          path={`${path}/defaultLevel`}
          value={String(course.defaultLevel ?? '')}
          onChange={(v) => change((c) => void (c.defaultLevel = Number(v)))}
          options={[1, 2, 3, 4, 5].map((l) => [String(l), `Уровень ${l}`])}
          className="adm-narrow"
        />
      </section>

      <section className="adm-card">
        <h3>Штрафы и защита от перебора</h3>
        <div className="adm-row adm-row--3">
          <Num label="Ошибка" suffix="% цены" scale={100} path={`${path}/errorPenalty`} value={course.errorPenalty} onChange={(v) => change((c) => void (c.errorPenalty = v))} />
          <Num label="Подсказка" suffix="% цены" scale={100} path={`${path}/hintPenalty`} value={course.hintPenalty} onChange={(v) => change((c) => void (c.hintPenalty = v))} />
          <Num label="Минимум, если решил сам" suffix="% цены" scale={100} path={`${path}/minShare`} value={course.minShare} onChange={(v) => change((c) => void (c.minShare = v))} />
        </div>
        <div className="adm-row">
          <Num label="Пауза начинается с ошибки №" path={`${path}/cooldownFromError`} value={course.cooldownFromError} onChange={(v) => change((c) => void (c.cooldownFromError = v))} />
          <Num label="Длина паузы" suffix="секунд" path={`${path}/cooldownSeconds`} value={course.cooldownSeconds} onChange={(v) => change((c) => void (c.cooldownSeconds = v))} />
        </div>
        <p className="adm-hint">Штрафы вычитаются из цены задачи и округляются до целого XP. «Я не знаю» всегда даёт 0 XP.</p>
      </section>
    </div>
  )
}

// Сайт целиком: название, список курсов и их порядок в каталоге
export function SiteEditor({ onOpenCourse, onAddCourse }) {
  const { content, update } = useAdmin()
  const { site, courses } = content

  const remove = (i) => {
    const course = courses[i]
    if (!confirm(`Удалить курс «${course.title}» со всеми уроками? ${course._orig ? 'Курс уже опубликован: после выгрузки прогресс учеников по нему станет недоступен, а папку курса нужно будет удалить из репозитория вручную.' : ''}`)) return
    update((c) => void c.courses.splice(i, 1))
  }

  return (
    <div className="adm-form">
      <section className="adm-card">
        <h2>Сайт</h2>
        <Text label="Название сайта" path="site/title" hint="Показывается в шапке и над каталогом курсов" value={site.title} onChange={(v) => update((c) => void (c.site.title = v))} />
        <Area label="Подзаголовок каталога" path="site/about" value={site.about} onChange={(v) => update((c) => void (c.site.about = v))} rows={2} />
      </section>

      <section className="adm-card" data-path="courses">
        <h3>Курсы</h3>
        <p className="adm-hint">В таком порядке курсы стоят в каталоге.</p>
        {courses.map((course, i) => (
          <div className="adm-line" key={course._key}>
            <button type="button" className="adm-line__title" onClick={() => onOpenCourse(course._key)}>
              {course.title || 'Без названия'} <span className="adm-chip adm-chip--mono">{course.id}</span>
            </button>
            <span className="adm-tools">
              {i > 0 && (
                <button type="button" className="adm-icon" aria-label="Курс выше" title="Выше" onClick={() => update((c) => shift(c.courses, i, -1))}>
                  ↑
                </button>
              )}
              {i < courses.length - 1 && (
                <button type="button" className="adm-icon" aria-label="Курс ниже" title="Ниже" onClick={() => update((c) => shift(c.courses, i, 1))}>
                  ↓
                </button>
              )}
              <button type="button" className="adm-icon adm-icon--danger" aria-label="Удалить курс" title="Удалить" onClick={() => remove(i)}>
                ×
              </button>
            </span>
          </div>
        ))}
        <button type="button" className="btn btn--ghost adm-btn" onClick={onAddCourse}>
          ＋ Курс
        </button>
        <Field path="courses" />
      </section>

      <section className="adm-card">
        <h3>Прогресс со старого сайта</h3>
        <Select
          label="Курс, в который переносится старый прогресс учеников"
          path="site/legacyCourse"
          hint="Раньше курс на сайте был один. Сохранённый тогда прогресс и старые ссылки вида #/lesson/l1 относятся к этому курсу. Менять не нужно, пока вы не меняете id этого курса."
          value={site.legacyCourse ?? ''}
          onChange={(v) => update((c) => void (v ? (c.site.legacyCourse = v) : delete c.site.legacyCourse))}
          options={[['', '— не переносить —'], ...courses.map((c) => [c.id, `${c.title} (${c.id})`])]}
        />
      </section>
    </div>
  )
}
