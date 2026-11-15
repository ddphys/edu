-- Начальная схема базы данных платформы.

-- Ссылки-приглашения. label — метка, которую получает каждый, кто зарегистрировался по ссылке.
CREATE TABLE invites (
  id          serial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  label       text NOT NULL,
  note        text NOT NULL DEFAULT '',
  role        text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  course_ids  int[] NOT NULL DEFAULT '{}',      -- на какие курсы сразу записать
  max_uses    int,                              -- NULL = без ограничения
  uses        int NOT NULL DEFAULT 0,
  expires_at  timestamptz,
  disabled    boolean NOT NULL DEFAULT false,
  created_by  int,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             serial PRIMARY KEY,
  email          text NOT NULL UNIQUE,          -- хранится в нижнем регистре
  password_hash  text NOT NULL,
  first_name     text NOT NULL,
  last_name      text NOT NULL,
  role           text NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'teacher', 'student')),
  note           text NOT NULL DEFAULT '',      -- свободный комментарий админа о пользователе
  invite_id      int REFERENCES invites(id) ON DELETE SET NULL,
  blocked        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz
);

ALTER TABLE invites ADD FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE courses (
  id             serial PRIMARY KEY,
  slug           text NOT NULL UNIQUE,
  title          text NOT NULL,
  badge          text NOT NULL DEFAULT '',
  about          text NOT NULL DEFAULT '',
  teacher_name   text NOT NULL DEFAULT '',
  teacher_photo  text NOT NULL DEFAULT '',
  default_task_xp      int NOT NULL DEFAULT 20,
  attempt_multipliers  real[] NOT NULL DEFAULT '{1,0.6,0.4,0.3,0.25}',
  position       int NOT NULL DEFAULT 0,
  published      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Запись ученика на курс (доступ к платным урокам)
CREATE TABLE enrollments (
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   int NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE lessons (
  id              serial PRIMARY KEY,
  course_id       int NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',     -- пункты описания, по одному на строку
  video_url       text NOT NULL DEFAULT '',
  video_vertical  boolean NOT NULL DEFAULT false,
  free            boolean NOT NULL DEFAULT false,
  published       boolean NOT NULL DEFAULT true,
  position        int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lessons_course_idx ON lessons(course_id, position);

-- Банк задач. Одна задача может входить в несколько уроков.
-- parts: [{ "label": "...", "answer": 8, "tolerance": 0.1 }]
-- hints: ["подсказка 1", "подсказка 2"]
CREATE TABLE tasks (
  id          serial PRIMARY KEY,
  code        text UNIQUE,                      -- короткий код (например, l1t1), необязателен
  title       text NOT NULL,
  text        text NOT NULL DEFAULT '',
  parts       jsonb NOT NULL DEFAULT '[]',
  hints       jsonb NOT NULL DEFAULT '[]',
  solution    text NOT NULL DEFAULT '',
  xp          int,                              -- NULL = по умолчанию курса
  topic       text NOT NULL DEFAULT '',
  tags        text[] NOT NULL DEFAULT '{}',
  difficulty  int CHECK (difficulty BETWEEN 1 AND 5),
  source      text NOT NULL DEFAULT '',
  note        text NOT NULL DEFAULT '',         -- внутренняя заметка, ученики не видят
  archived    boolean NOT NULL DEFAULT false,
  created_by  int REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lesson_tasks (
  lesson_id  int NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  task_id    int NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  position   int NOT NULL DEFAULT 0,
  PRIMARY KEY (lesson_id, task_id)
);
CREATE INDEX lesson_tasks_task_idx ON lesson_tasks(task_id);

-- Текущее состояние ученика по задаче
CREATE TABLE progress (
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id     int NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'correct', 'wrong', 'skipped')),
  attempts    int NOT NULL DEFAULT 0,
  hints_used  int NOT NULL DEFAULT 0,
  answers     jsonb NOT NULL DEFAULT '[]',
  ok_parts    jsonb NOT NULL DEFAULT '[]',
  xp          int NOT NULL DEFAULT 0,
  started_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);
CREATE INDEX progress_task_idx ON progress(task_id);

-- Журнал всех действий по задачам — для статистики
CREATE TABLE task_events (
  id          bigserial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id     int NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('attempt', 'hint', 'skip', 'reset')),
  answers     jsonb,
  correct     boolean,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_events_task_idx ON task_events(task_id);
CREATE INDEX task_events_user_idx ON task_events(user_id, created_at);

-- Загруженные картинки
CREATE TABLE uploads (
  id          text PRIMARY KEY,                 -- имя файла на диске
  original    text NOT NULL,
  mime        text NOT NULL,
  size        int NOT NULL,
  created_by  int REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
