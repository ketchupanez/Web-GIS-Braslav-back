# Backend ГИС Браславские озера

cd gis-app-back

## Первый запуск

# Установить зависимости
bun install

# Сгенерировать Prisma Client
bun run db:generate

# Настроить .env (DATABASE_URL, JWT_SECRET)

# Подключиться к PostgreSQL и выполнить:
CREATE DATABASE braslav_gis;

# Применить все миграции
bun run db:deploy

# Создать Супер-Админа:
bun run db:seed:admin <логин> <пароль> "ФИО"
Пример: bun run db:seed:admin SuperAdmin123 SuperPass123 "Супер Администратор"

# Импорт геоданных
bun run db:seed:geo

# Запустить 
bun start / bun run dev

bun prisma studio  - проверка БД


# Фронтенд ГИС Браславские озера

## Установка
1. Распаковать архив
2. bun install
3. Создать .env (есть .env.example):
   VITE_API_URL=http://localhost:3000/api
4. bun run build
5. Разместить папку dist на веб-сервере (Nginx/Apache)