import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️ Очистка таблиц инфраструктуры...');
  
  await prisma.accommodation.deleteMany({});
  console.log('✅ accommodations очищена');
  
  await prisma.touristStop.deleteMany({});
  console.log('✅ tourist_stops очищена');
  
  await prisma.tourismOrganizer.deleteMany({});
  console.log('✅ tourism_organizers очищена');
  
  await prisma.riverSegment.deleteMany({});
  console.log('✅ river_segments очищены');
  
  await prisma.river.deleteMany({});
  console.log('✅ rivers очищены');
  
  console.log('✨ Все таблицы очищены! Теперь запустите импорт.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });