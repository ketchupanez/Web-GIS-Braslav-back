# Backend ГИС Браславские озера

## Требования
- Node.js 18+ или Bun
- PostgreSQL 15+
- PostGIS (опционально, для продвинутых геозапросов)

## Установка
1. Создать базу данных: CREATE DATABASE braslav_gis;
2. Установить зависимости: bun install
3. Настроить .env (DATABASE_URL, JWT_SECRET)
4. Применить миграции: bun prisma migrate deploy
5. Запустить: bun start

## Первый запуск
- Создать супер-админа: bun run db:seed:admin admin пароль "ФИО"

bun prisma studio  - проверка БД


# Фронтенд ГИС Браславские озера

## Требования
- Node.js 18+ или Bun
- NPM или Bun

## Установка
1. Распаковать архив
2. bun install
3. Создать .env:
   VITE_API_URL=http://localhost:3000/api
4. bun run build
5. Разместить папку dist на веб-сервере (Nginx/Apache)