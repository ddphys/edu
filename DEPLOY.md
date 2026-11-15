# Как запустить сайт на своём сервере

Пошаговая инструкция для первого запуска: от аренды сервера до работающего сайта с HTTPS.
Займёт примерно час. Команды выполняются на сервере, их можно копировать целиком.

## 0. Что понадобится

| Что | Где взять | Сколько стоит |
|---|---|---|
| VPS (виртуальный сервер) в России, Ubuntu 24.04, 2 ГБ памяти, 1–2 ядра, 20+ ГБ диска | Timeweb Cloud, Selectel, REG.RU, Yandex Cloud | 300–700 ₽/мес |
| Домен, например `fizolimp.ru` | REG.RU, RU-CENTER (nic.ru) | 200–900 ₽/год |

Сервер в России нужен из-за закона 152-ФЗ: персональные данные учеников (имя и email) должны храниться в РФ.

## 1. Арендовать сервер

1. Зарегистрируйтесь у хостера, создайте сервер: **Ubuntu 24.04**, 2 ГБ RAM.
2. При создании добавьте **SSH-ключ**. Если ключа нет, создайте его на своём компьютере командой `ssh-keygen -t ed25519`
   (на Windows — в PowerShell) и вставьте содержимое файла `~/.ssh/id_ed25519.pub`.
3. Запишите **IP-адрес** сервера (вида `185.12.34.56`).
4. Подключитесь: `ssh root@185.12.34.56`.

## 2. Купить домен и направить его на сервер

В панели регистратора, в разделе DNS, создайте две записи:

| Тип | Имя | Значение |
|---|---|---|
| A | `@` | IP сервера |
| A | `www` | IP сервера |

Записи начинают работать через 15 минут — несколько часов.

## 3. Установить программы на сервер

```bash
apt update && apt upgrade -y
apt install -y git curl ufw postgresql
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

- **PostgreSQL** — база данных.
- **Node.js** — запускает сервер сайта.
- **Caddy** — принимает запросы из интернета и сам получает бесплатный HTTPS-сертификат.

Брандмауэр — открываем только SSH и веб:

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 4. Создать базу

Придумайте пароль базы (длинный, без кавычек) и подставьте вместо `ПАРОЛЬ_БАЗЫ`:

```bash
sudo -u postgres psql -c "CREATE USER edu WITH PASSWORD 'ПАРОЛЬ_БАЗЫ';"
sudo -u postgres psql -c "CREATE DATABASE edu OWNER edu;"
```

## 5. Скачать код и собрать сайт

```bash
useradd -m -s /bin/bash edu
sudo -iu edu
git clone https://github.com/ddphys/edu.git
cd edu
npm ci && npm run build
cd server && npm ci --omit=dev
cp .env.example .env
nano .env
```

Если репозиторий приватный, `git clone` попросит доступ: создайте на GitHub **Deploy key**
(Settings → Deploy keys) с ключом из `ssh-keygen` на сервере и клонируйте по адресу `git@github.com:ddphys/edu.git`.

В `.env` заполните (сохранить в nano: Ctrl+O, Enter, выйти: Ctrl+X):

```
DATABASE_URL=postgres://edu:ПАРОЛЬ_БАЗЫ@localhost:5432/edu
PORT=3000
HOST=127.0.0.1
COOKIE_SECURE=true
OPEN_REGISTRATION=true
UPLOAD_DIR=uploads
ADMIN_EMAIL=ваш@email.ru
ADMIN_PASSWORD=длинный-пароль-админа
ADMIN_FIRST_NAME=Имя
ADMIN_LAST_NAME=Фамилия
```

Создать таблицы, перенести курс и создать админа:

```bash
npm run seed
exit
```

## 6. Запускать сервер автоматически

Служба systemd будет держать сервер включённым и перезапускать его после сбоев и перезагрузки:

```bash
cp /home/edu/edu/deploy/edu.service /etc/systemd/system/edu.service
systemctl daemon-reload
systemctl enable --now edu
systemctl status edu
```

В выводе должно быть `active (running)`. Логи: `journalctl -u edu -f`.

## 7. Подключить домен и HTTPS

```bash
cp /home/edu/edu/deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile
systemctl reload caddy
```

В `Caddyfile` замените `example.ru` на свой домен. Через минуту сайт откроется по `https://ваш-домен`,
сертификат Caddy получит и будет продлевать сам.

Кабинет: `https://ваш-домен/admin` — вход с `ADMIN_EMAIL` и `ADMIN_PASSWORD`.

## 8. Резервные копии базы

Каждую ночь сохранять копию и хранить последние 14:

```bash
mkdir -p /var/backups/edu && chown postgres /var/backups/edu
cp /home/edu/edu/deploy/backup.sh /usr/local/bin/edu-backup && chmod +x /usr/local/bin/edu-backup
echo "30 3 * * * postgres /usr/local/bin/edu-backup" > /etc/cron.d/edu-backup
```

Копии лежат на том же сервере. Раз в неделю скачивайте их к себе
(`scp root@IP:/var/backups/edu/*.sql.gz .`) или включите у хостера автоматические снимки сервера.
Картинки задач лежат в `/home/edu/edu/server/uploads` — их тоже стоит копировать.

## Обновление сайта после изменений в GitHub

```bash
sudo -iu edu bash -c 'cd edu && git pull && npm ci && npm run build && cd server && npm ci --omit=dev'
systemctl restart edu
```

Новые таблицы в базе (миграции) применяются автоматически при запуске.

## Юридическое (152-ФЗ) — сделать до запуска для учеников

- Подать уведомление в Роскомнадзор об обработке персональных данных (бесплатно, на pd.rkn.gov.ru).
- Опубликовать на сайте политику обработки персональных данных.
- Добавить в регистрацию галочку согласия на обработку данных. Для учеников младше 14 лет нужно согласие родителей.
