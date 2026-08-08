# Развёртывание krish-a на ps.kz

Стек: фронт (React) + API (Node/Express) + PostgreSQL — всё в Docker.
Поднимается одной командой. Ниже — вариант на VPS ps.kz.

## 1. Заказать сервер
В личном кабинете ps.kz закажите **VPS / облачный сервер** с Ubuntu 22.04
(минимум 2 vCPU / 2 ГБ RAM / 20 ГБ SSD). Получите IP и root-доступ (SSH).

## 2. Подключиться и поставить Docker
```bash
ssh root@ВАШ_IP

apt update && apt -y upgrade
apt -y install docker.io docker-compose-plugin git
systemctl enable --now docker
docker --version && docker compose version
```

## 3. Загрузить проект
Вариант А — из вашего GitHub:
```bash
git clone https://github.com/Beka-end/Mortgage-Broker.git app
cd app
```
Вариант Б — залить архив: распакуйте `mortgage-broker.zip` и через `scp` скопируйте
папку на сервер, затем `cd` в неё.

## 4. Настроить пароль БД
```bash
cp .env.example .env
nano .env        # POSTGRES_PASSWORD=надёжный_пароль
```

## 5. Запустить
```bash
docker compose up -d --build
```
Первый запуск соберёт фронт и образы — 3–5 минут. Проверка:
```bash
docker compose ps
curl http://localhost/api/health      # {"ok":true,...}
```
Откройте `http://ВАШ_IP` — маркетплейс работает, данные хранятся в PostgreSQL
(общие для всех пользователей).

## 6. Подключить домен krish-a.kz
В DNS домена (панель ps.kz → «Мои домены» → DNS) укажите A-запись на IP сервера:
```
A   @     ВАШ_IP
A   www   ВАШ_IP
```
Удалите старые A-записи парковки. Через 15–30 минут домен откроет сайт.

## 7. SSL (https)
Ставим reverse-proxy Caddy — сам получает и продлевает сертификат Let's Encrypt.
```bash
apt -y install debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt -y install caddy
```
Освободите 80-й порт для Caddy: в `docker-compose.yml` у сервиса `web` замените
`"80:80"` на `"8080:80"`, затем `docker compose up -d`.
`/etc/caddy/Caddyfile`:
```
krish-a.kz, www.krish-a.kz {
    reverse_proxy localhost:8080
}
```
```bash
systemctl restart caddy
```
После этого `https://krish-a.kz` работает с сертификатом.

## Обновление версии
```bash
cd app && git pull   # или залить новый архив
docker compose up -d --build
```

## Обслуживание
```bash
docker compose logs -f api      # логи API
docker compose logs -f web      # логи фронта
docker compose restart          # перезапуск
# бэкап БД
docker compose exec db pg_dump -U krisha krisha > backup_$(date +%F).sql
```

## Важно про зону .kz
Домен `.kz` иногда требует локализации (NS/хостинг в Казахстане). VPS ps.kz
находится в РК — это условие выполняется. Если делегирование NS вызовет вопрос —
используйте DNS ps.kz (что и описано в шаге 6).

## Безопасность (для боевого режима)
Текущий прототип не проверяет права на сервере (роли — на фронте) и хранит общую
базу как JSON в таблице `kv_store`. Перед реальным запуском:
- перевести данные на реляционную модель `db/schema.sql`;
- добавить серверную аутентификацию (JWT) и проверку ролей в API;
- хранить токены банков только на сервере (в API уже есть заглушка прокси
  `/api/bank/...` — туда переносится сборка StartMortgage и приём колбэков);
- вынести загрузку картинок в объектное хранилище.
