// Тренажёры: список (#/trainers), карта уровней и сама тренировка.
// Подгружается отдельным файлом (см. App.jsx): ученику, который не открыл тренажёр, его код не скачивается.
import './fonts.js'
import './trainers.css'
import { href } from '../routes.js'
import Scene from './draw/Scene.jsx'
import { describe } from './friction/instance.js'
import { LEVELS, levelOf } from './friction/levels.js'
import Play from './friction/Play.jsx'
import { situationById } from './friction/scenes/index.js'

// Рисунок на карточке тренажёра: одна из ситуаций с разбором
function Preview() {
  const inst = describe(situationById('1.4'))
  return (
    <div className="tr-preview" aria-hidden="true">
      <Scene figure={inst.figure} surface={inst.surface} angle={inst.angle} friction={{ dir: inst.dir }} />
    </div>
  )
}

function TrainerList() {
  return (
    <div className="tr tr--page">
      <h1 className="tr-title">Тренажёры</h1>
      <p className="tr-lead">Короткие задания, чтобы набить руку на том, что в задачах ЕГЭ обычно теряют первым.</p>
      <div className="tr-cards">
        <a className="tr-card tr-trainer" href={href.trainer('friction')}>
          <Preview />
          <span className="tr-trainer__title">Сила трения</span>
          <span className="tr-trainer__about">Куда направлена сила трения: покоя, скольжения, или её вовсе нет. {LEVELS.length} уровней, серии по 10 заданий.</span>
          <span className="tr-trainer__go">Открыть →</span>
        </a>
      </div>
    </div>
  )
}

function LevelMap() {
  return (
    <div className="tr tr--page">
      <a className="tr-back" href={href.trainers()}>
        ← Тренажёры
      </a>
      <h1 className="tr-title">Сила трения</h1>
      <p className="tr-lead">Сначала выбираем тип трения, потом направление. Серия — 10 заданий; ошибка вернётся в серии ещё раз. Все уровни открыты.</p>
      <div className="tr-levels">
        {LEVELS.map((l) =>
          l.ready ? (
            <a key={l.n} className="tr-card tr-level" href={href.trainerLevel('friction', l.n)}>
              <span className="tr-level__n">{l.n}</span>
              <span className="tr-level__body">
                <span className="tr-level__title">{l.title}</span>
                <span className="tr-level__about">{l.about}</span>
              </span>
              <span className="tr-level__go" aria-hidden="true">
                →
              </span>
            </a>
          ) : (
            <div key={l.n} className="tr-card tr-level is-soon" aria-disabled="true">
              <span className="tr-level__n">{l.n}</span>
              <span className="tr-level__body">
                <span className="tr-level__title">{l.title}</span>
                <span className="tr-level__about">{l.about}</span>
              </span>
              <span className="tr-level__soon">скоро</span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function LevelSoon({ level }) {
  const info = levelOf(level)
  return (
    <div className="tr tr--page">
      <a className="tr-back" href={href.trainer('friction')}>
        ← Уровни
      </a>
      <h1 className="tr-title">Уровень {level} скоро</h1>
      <p className="tr-lead">«{info?.title}» ещё готовится. Пока открыты уровни 1 и 2.</p>
    </div>
  )
}

export default function Trainers({ route }) {
  if (route.view === 'list') return <TrainerList />
  if (route.view === 'levels') return <LevelMap />
  if (!levelOf(route.level)?.ready) return <LevelSoon level={route.level} />
  return <Play level={route.level} />
}
