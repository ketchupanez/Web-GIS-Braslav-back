# Backend ГИС Браславские озера

cd gis-app-back

## Требования
- Node.js 18+ или Bun 1.0+
- PostgreSQL 16+

## Первый запуск

### 1. Установить зависимости
bun install


### 2. Сгенерировать Prisma Client
bun run db:generate


### 3. Создать БД
### Если PostgreSQL настроен без пароля (локально):
- psql -U postgres -c "CREATE DATABASE braslav_gis;" - для стандартного порта :5432

- psql -U postgres -h localhost -p 5434 -c "CREATE DATABASE braslav_gis;" - для нестандартного порта, здесь это :5434

### Если требуется пароль:
- psql -U postgres -W -c "CREATE DATABASE braslav_gis;"
  
(введите пароль пользователя postgres)


### 4. Настроить .env (DATABASE_URL, JWT_SECRET)
на основе .env.example

### DATABASE_URL

postgresql://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@ХОСТ:ПОРТ/ИМЯ_БД?schema=public

Примеры:
- Стандартный порт 5432:
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/braslav_gis?schema=public"

- Нестандартный порт 5434:
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/braslav_gis?schema=public"

! Замените postgres:postgres на ваши реальные логин и пароль от PostgreSQL.

### JWT_SECRET

- Минимум 32 символа! Сгенерируй случайную строку.


### 5. Применить все миграции
bun run db:deploy


### 6. Создать Супер-Администратора:
bun run db:seed:admin <логин> <пароль> "ФИО"

Пример: bun run db:seed:admin SuperAdmin123 SuperPass123 "Супер Администратор"


### 7. Импортировать геоданные
bun run db:seed:geo


### 8. Запустить 
bun start / bun run dev

bun prisma studio  - проверка БД


# Фронтенд ГИС Браславские озера

## Установка
1. Распаковать архив
2. bun install
3. Создать .env (есть .env.example):
   - Для локальной разработки: VITE_API_URL=http://localhost:3000/api
   - Для продакшена заменить на URL развёрнутого бэкенда, например:
 VITE_API_URL=https://my-app.up.railway.app/api
4. bun run build (собрать проект)
5. Разместить папку dist на веб-сервере (Nginx/Apache)
