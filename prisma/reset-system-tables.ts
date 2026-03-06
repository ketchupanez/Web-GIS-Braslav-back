import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  
  await prisma.auditLog.deleteMany({});
  console.log('audit_logs очищены');
  
  await prisma.chartConfig.deleteMany({});
  console.log('chart_configs очищены');
  
  await prisma.dynamicRecord.deleteMany({});
  console.log('dynamic_records очищены');
  
  await prisma.dynamicTable.deleteMany({});
  console.log('dynamic_tables очищены');
  
  await prisma.riverSegment.deleteMany({});
  console.log('river_segments очищены');
  
  await prisma.spring.deleteMany({});
  console.log('springs очищены');
  
  await prisma.river.deleteMany({});
  console.log('rivers очищены');
  
  await prisma.lake.deleteMany({});
  console.log('lakes очищены');
  
  await prisma.accommodation.deleteMany({});
  console.log('accommodations очищены');
  
  await prisma.touristStop.deleteMany({});
  console.log('tourist_stops очищены');
  
  await prisma.tourismOrganizer.deleteMany({});
  console.log('tourism_organizers очищены');
  
  console.log('База очищена.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });