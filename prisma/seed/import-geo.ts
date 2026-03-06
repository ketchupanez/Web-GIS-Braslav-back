import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const cleanLakeName = (name: string): string => {
  return name.replace(/оз\.\s*№\s*\d+\s*\(?([^)]*)\)?/i, '$1').trim() || name;
};

// Импорт озер
async function importLakes() {
  const filePath = path.join(__dirname, '../../data/lakes/lakes_braslav.geojson');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const geojson = JSON.parse(raw);

  for (const feature of geojson.features) {
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    await prisma.lake.upsert({
      where: { name: cleanLakeName(props.name) },
      update: {
        name: cleanLakeName(props.name),
        geometry: feature.geometry,
        center: coords,
        areaHa: props.area_ha,
      },
      create: {
        name: cleanLakeName(props.name),
        geometry: feature.geometry,
        center: coords,
        areaHa: props.area_ha,
      },
    });
  }

  console.log(`Импортировано озер: ${geojson.features.length}`);
}

// Импорт родников
async function importSprings() {
  const filePath = path.join(__dirname, '../../data/springs/springs.geojson');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const geojson = JSON.parse(raw);

  for (const feature of geojson.features) {
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    await prisma.spring.upsert({
      where: { name: props.name },
      update: {
        name: props.name,
        geometry: feature.geometry,
        coordinates: coords,
      },
      create: {
        name: props.name,
        geometry: feature.geometry,
        coordinates: coords,
      },
    });
  }

  console.log(`Импортировано родников: ${geojson.features.length}`);
}

// Импорт баз отдыха
async function importAccommodation() {
  const filePath = path.join(__dirname, '../../data/accommodation/accommodation.geojson');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const geojson = JSON.parse(raw);

  for (const feature of geojson.features) {
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    await prisma.accommodation.upsert({
      where: { name: props.name },
      update: {
        name: props.name,
        type: (props.type || 'HOTEL').toUpperCase(),
        geometry: feature.geometry,
        coordinates: coords,
        address: props.address,
      },
      create: {
        name: props.name,
        type: (props.type || 'HOTEL').toUpperCase(),
        geometry: feature.geometry,
        coordinates: coords,
        address: props.address,
      },
    });
  }

  console.log(`Импортировано баз отдыха: ${geojson.features.length}`);
}

// Импорт турстоянок
async function importTouristStops() {
  const filePath = path.join(__dirname, '../../data/tourist_stops/tourist_stops.geojson');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const geojson = JSON.parse(raw);

  for (const feature of geojson.features) {
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    await prisma.touristStop.upsert({
      where: { name: props.name },
      update: {
        name: props.name,
        geometry: feature.geometry,
        coordinates: coords,
      },
      create: {
        name: props.name,
        geometry: feature.geometry,
        coordinates: coords,
      },
    });
  }

  console.log(`Импортировано турстоянок: ${geojson.features.length}`);
}

// Импорт турорганизаторов
async function importTourismOrganizers() {
  const filePath = path.join(__dirname, '../../data/tourism_organizers/tourism_organizers.geojson');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const geojson = JSON.parse(raw);

  for (const feature of geojson.features) {
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    await prisma.tourismOrganizer.upsert({
      where: { name: props.name },
      update: {
        name: props.name,
        type: props.type?.toUpperCase() || 'INFO_CENTER',
        geometry: feature.geometry,
        coordinates: coords,
      },
      create: {
        name: props.name,
        type: props.type?.toUpperCase() || 'INFO_CENTER',
        geometry: feature.geometry,
        coordinates: coords,
      },
    });
  }

  console.log(`Импортировано турорганизаторов: ${geojson.features.length}`);
}

// Импорт рек (сегменты)
async function importRivers() {
  const filePath = path.join(__dirname, '../../data/rivers/rivers_full.geojson');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const geojson = JSON.parse(raw);

  const riverGroups = new Map<string, any[]>();
  
  for (const feature of geojson.features) {
    const name = feature.properties.name || 'Unknown';
    if (!riverGroups.has(name)) {
      riverGroups.set(name, []);
    }
    riverGroups.get(name)!.push(feature);
  }

  for (const [riverName, segments] of riverGroups) {
    const river = await prisma.river.upsert({
      where: { name: riverName },
      update: {},
      create: {
        name: riverName,
      },
    });

    let validSegmentIndex = 0;
    for (const segment of segments) {
      if (!segment.geometry || !segment.geometry.coordinates) {
        console.warn(`⏭️ Пропуск сегмента без geometry: ${segment.properties.id || 'no-id'}`);
        continue;
      }
      
      const coords = segment.geometry.coordinates;
      
      if (!Array.isArray(coords) || coords.length === 0 || !Array.isArray(coords[0])) {
        console.warn(`⏭️ Пропуск точки (не линия): ${segment.properties.id || 'no-id'}`);
        continue;
      }

      await prisma.riverSegment.upsert({
        where: { 
          id: segment.properties.id || `${river.id}_${validSegmentIndex}` 
        },
        update: {
          geometry: segment.geometry,
          order: validSegmentIndex,
        },
        create: {
          riverId: river.id,
          geometry: segment.geometry,
          order: validSegmentIndex,
        },
      });
      
      validSegmentIndex++;
    }
  }

  console.log(`Импортировано рек: ${riverGroups.size}`);
}

async function main() {
  
  await importLakes();
  await importSprings();
  await importAccommodation();
  await importTouristStops();
  await importTourismOrganizers();
  await importRivers();
  
  console.log('\n Импорт завершен.');
}

main()
  .catch((e) => {
    console.error('Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });