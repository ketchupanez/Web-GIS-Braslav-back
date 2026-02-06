// scripts/reset-all-for-migration.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️ Полная очистка базы для миграции...');
  
  // 1. Удаляем зависимые записи (сначала те, что ссылаются на другие)
  await prisma.auditLog.deleteMany({});
  console.log('✅ audit_logs очищены');
  
  await prisma.chartConfig.deleteMany({});
  console.log('✅ chart_configs очищены');
  
  await prisma.dynamicRecord.deleteMany({});
  console.log('✅ dynamic_records очищены');
  
  await prisma.dynamicTable.deleteMany({});
  console.log('✅ dynamic_tables очищены');
  
  // 2. Системные таблицы
  await prisma.riverSegment.deleteMany({});
  console.log('✅ river_segments очищены');
  
  await prisma.spring.deleteMany({});
  console.log('✅ springs очищены');
  
  await prisma.river.deleteMany({});
  console.log('✅ rivers очищены');
  
  await prisma.lake.deleteMany({});
  console.log('✅ lakes очищены');
  
  await prisma.accommodation.deleteMany({});
  console.log('✅ accommodations очищены');
  
  await prisma.touristStop.deleteMany({});
  console.log('✅ tourist_stops очищены');
  
  await prisma.tourismOrganizer.deleteMany({});
  console.log('✅ tourism_organizers очищены');
  
  // 3. Пользователей оставляем, но можно и их:
  // await prisma.user.deleteMany({});
  // console.log('✅ users очищены');
  
  console.log('✨ База очищена! Можно генерировать миграцию.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });