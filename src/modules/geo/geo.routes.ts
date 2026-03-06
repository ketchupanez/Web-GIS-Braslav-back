import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { GeoService } from './geo.service';
import { prisma } from '../../shared/database';
import { AuditService } from '../audit/audit.service';

const router = Router();
const service = new GeoService();

router.get('/lakes', async (req, res) => {
  const data = await service.getLakes();
  res.json(data);
});

router.get('/lakes/:id', async (req, res) => {
  const lake = await prisma.lake.findUnique({
    where: { id: parseInt(req.params.id) }
  });
  
  if (!lake) {
    return res.status(404).json({ message: 'Озеро не найдено' });
  }
  
  res.json(lake);
});

router.patch('/lakes/:id', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, areaHa, area_ha, center } = req.body;
    const finalAreaHa = areaHa !== undefined ? areaHa : (area_ha !== undefined ? (area_ha ? parseFloat(area_ha) : null) : undefined);
    
    const oldLake = await prisma.lake.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    
    if (!oldLake) {
      return res.status(404).json({ message: 'Озеро не найдено' });
    }
    
    const updateData: any = { 
      name, 
      areaHa: finalAreaHa 
    };
    
    if (center && Array.isArray(center)) {
      updateData.center = center;
      updateData.geometry = {
        type: 'Point',
        coordinates: center
      };
    }
    
    const updated = await prisma.lake.update({
      where: { id: parseInt(req.params.id) },
      data: updateData
    });

    const audit = new AuditService();
    await audit.logUpdate({
      userId: req.user!.userId,
      tableRef: 'lakes',
      tableName: 'Озёра',
      recordId: String(updated.id),
      recordName: updated.name,
      oldValue: { name: oldLake.name, areaHa: oldLake.areaHa, center: oldLake.center },
      newValue: { name: updated.name, areaHa: updated.areaHa, center: updated.center },
      description: `Изменено озеро: ${oldLake.name}`,
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating lake:', error);
    res.status(500).json({ message: 'Ошибка обновления' });
  }
});

router.post('/lakes', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, areaHa, area_ha, center } = req.body;
    const finalAreaHa = areaHa !== undefined ? areaHa : (area_ha ? parseFloat(area_ha) : null);
    
    if (!name || !center || !Array.isArray(center)) {
      return res.status(400).json({ message: 'Необходимо указать название и координаты центра' });
    }
    
    const lake = await prisma.lake.create({
      data: {
        name,
        areaHa: finalAreaHa,
        center,
        geometry: {
          type: 'Point',
          coordinates: center
        }
      }
    });
    
    const audit = new AuditService();
    await audit.logCreate({
      userId: req.user!.userId,
      tableRef: 'lakes',
      tableName: 'Озёра',
      recordId: String(lake.id),
      recordName: lake.name,
      description: `Создано новое озеро: ${lake.name}`,
    });
    
    res.status(201).json(lake);
  } catch (error) {
    console.error('Error creating lake:', error);
    res.status(500).json({ message: 'Ошибка создания озера' });
  }
});

router.delete('/lakes/:id', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const lake = await prisma.lake.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    
    if (!lake) {
      return res.status(404).json({ message: 'Озеро не найдено' });
    }
    
    await prisma.lake.delete({
      where: { id: parseInt(req.params.id) }
    });
    
    const audit = new AuditService();
    await audit.logDelete({
      userId: req.user!.userId,
      tableRef: 'lakes',
      tableName: 'Озёра',
      recordId: String(lake.id),
      recordName: lake.name,
      description: `Удалено озеро: ${lake.name}`,
    });
    
    res.json({ message: 'Озеро удалено' });
  } catch (error) {
    console.error('Error deleting lake:', error);
    res.status(500).json({ message: 'Ошибка удаления' });
  }
});

router.get('/lakes/:id/related-data', async (req, res) => {
  try {
    const lakeId = parseInt(req.params.id);
    
    const tables = await prisma.dynamicTable.findMany({
      where: {
        linkedToObjects: true,
        objectType: 'LAKE',
      },
      include: {
        records: {
          where: { lakeId },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const result: Record<string, any[]> = {};
    
    for (const table of tables) {
      if (table.records.length > 0) {
        result[table.name] = table.records.map(record => {
          const data = record.data as Record<string, any> || {};
          return {
            id: record.id,
            ...data,
            date: record.date,
            year: record.year,
            createdAt: record.createdAt,
          };
        });
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching lake related data:', error);
    res.status(500).json({ message: 'Ошибка загрузки связанных данных' });
  }
});

// Родники

router.get('/springs', async (req, res) => {
  const data = await service.getSprings();
  res.json(data);
});

router.get('/springs/:id', async (req, res) => {
  const spring = await prisma.spring.findUnique({
    where: { id: parseInt(req.params.id) }
  });
  
  if (!spring) {
    return res.status(404).json({ message: 'Родник не найден' });
  }
  
  res.json(spring);
});

router.post('/springs', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, coordinates, riverId } = req.body;
    
    if (!name || !coordinates || !Array.isArray(coordinates)) {
      return res.status(400).json({ message: 'Необходимо указать название и координаты' });
    }
    
    const spring = await prisma.spring.create({
      data: {
        name,
        coordinates,
        geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        riverId: riverId ? parseInt(riverId) : null
      }
    });
    
    const audit = new AuditService();
    await audit.logCreate({
      userId: req.user!.userId,
      tableRef: 'springs',
      tableName: 'Родники',
      recordId: String(spring.id),
      recordName: spring.name,
      description: `Создан новый родник: ${spring.name}`,
    });
    
    res.status(201).json(spring);
  } catch (error) {
    console.error('Error creating spring:', error);
    res.status(500).json({ message: 'Ошибка создания родника' });
  }
});

router.patch('/springs/:id', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, coordinates, riverId } = req.body;
    
    const oldSpring = await prisma.spring.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    
    if (!oldSpring) {
      return res.status(404).json({ message: 'Родник не найден' });
    }
    
    const updateData: any = { name, riverId: riverId ? parseInt(riverId) : null };
    
    if (coordinates && Array.isArray(coordinates)) {
      updateData.coordinates = coordinates;
      updateData.geometry = {
        type: 'Point',
        coordinates: coordinates
      };
    }
    
    const updated = await prisma.spring.update({
      where: { id: parseInt(req.params.id) },
      data: updateData
    });
    
    const audit = new AuditService();
    await audit.logUpdate({
      userId: req.user!.userId,
      tableRef: 'springs',
      tableName: 'Родники',
      recordId: String(updated.id),
      recordName: updated.name,
      oldValue: { name: oldSpring.name, coordinates: oldSpring.coordinates, riverId: oldSpring.riverId },
      newValue: { name: updated.name, coordinates: updated.coordinates, riverId: updated.riverId },
      description: `Изменён родник: ${oldSpring.name}`,
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating spring:', error);
    res.status(500).json({ message: 'Ошибка обновления родника' });
  }
});

router.delete('/springs/:id', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const spring = await prisma.spring.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    
    if (!spring) {
      return res.status(404).json({ message: 'Родник не найден' });
    }
    
    await prisma.spring.delete({
      where: { id: parseInt(req.params.id) }
    });
    
    const audit = new AuditService();
    await audit.logDelete({
      userId: req.user!.userId,
      tableRef: 'springs',
      tableName: 'Родники',
      recordId: String(spring.id),
      recordName: spring.name,
      description: `Удалён родник: ${spring.name}`,
    });
    
    res.json({ message: 'Родник удалён' });
  } catch (error) {
    console.error('Error deleting spring:', error);
    res.status(500).json({ message: 'Ошибка удаления' });
  }
});

router.get('/springs/:id/related-data', async (req, res) => {
  try {
    const springId = parseInt(req.params.id);
    
    const tables = await prisma.dynamicTable.findMany({
      where: {
        linkedToObjects: true,
        objectType: 'SPRING',
      },
      include: {
        records: {
          where: { springId },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const result: Record<string, any[]> = {};
    
    for (const table of tables) {
      if (table.records.length > 0) {
        result[table.name] = table.records.map(record => {
          const data = record.data as Record<string, any> || {};
          return {
            id: record.id,
            ...data,
            date: record.date,
            year: record.year,
            createdAt: record.createdAt,
          };
        });
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching spring related data:', error);
    res.status(500).json({ message: 'Ошибка загрузки связанных данных' });
  }
});

// Реки

router.get('/rivers', async (req, res) => {
  const data = await service.getRivers();
  res.json(data);
});

router.get('/rivers-list', async (req, res) => {
  const data = await service.getRiversList();
  res.json(data);
});

router.get('/rivers/:id', async (req, res) => {
  const river = await prisma.river.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { segments: true }
  });
  
  if (!river) {
    return res.status(404).json({ message: 'Река не найдена' });
  }
  
  res.json(river);
});

router.post('/rivers', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, segments } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Необходимо указать название реки' });
    }

    const river = await prisma.$transaction(async (tx) => {
      const newRiver = await tx.river.create({
        data: { name }
      });
      
      if (segments && Array.isArray(segments) && segments.length > 0) {
        await tx.riverSegment.createMany({
          data: segments.map((seg: any, index: number) => ({
            riverId: newRiver.id,
            geometry: seg.geometry,
            order: seg.order || index
          }))
        });
      }
      
      return newRiver;
    });
    
    const audit = new AuditService();
    await audit.logCreate({
      userId: req.user!.userId,
      tableRef: 'rivers',
      tableName: 'Реки',
      recordId: String(river.id),
      recordName: river.name,
      description: `Создана новая река: ${river.name} (${segments?.length || 0} сегментов)`,
    });
    
    res.status(201).json(river);
  } catch (error) {
    console.error('Error creating river:', error);
    res.status(500).json({ message: 'Ошибка создания реки' });
  }
});

router.patch('/rivers/:id', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    
    const oldRiver = await prisma.river.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { segments: true }
    });
    
    if (!oldRiver) {
      return res.status(404).json({ message: 'Река не найдена' });
    }
    
    const updatedRiver = await prisma.river.update({
      where: { id: parseInt(req.params.id) },
      data: { name }
    });
    
    const audit = new AuditService();
    await audit.logUpdate({
      userId: req.user!.userId,
      tableRef: 'rivers',
      tableName: 'Реки',
      recordId: String(updatedRiver.id),
      recordName: updatedRiver.name,
      oldValue: { name: oldRiver.name, segmentCount: oldRiver.segments.length },
      newValue: { name: updatedRiver.name },
      description: `Переименована река: ${oldRiver.name} → ${updatedRiver.name}`,
    });
    
    res.json(updatedRiver);
  } catch (error) {
    console.error('Error updating river:', error);
    res.status(500).json({ message: 'Ошибка обновления реки' });
  }
});

router.patch('/rivers/by-name/:name', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const oldName = req.params.name;
    const { newName } = req.body;
    
    if (!newName) {
      return res.status(400).json({ message: 'Укажите новое название' });
    }
    
    const river = await prisma.river.findUnique({
      where: { name: oldName }
    });
    
    if (!river) {
      return res.status(404).json({ message: 'Река не найдена' });
    }
    
    const updated = await prisma.river.update({
      where: { id: river.id },
      data: { name: newName }
    });
    
    const segmentsCount = await prisma.riverSegment.count({ where: { riverId: river.id } });
    
    const audit = new AuditService();
    await audit.logUpdate({
      userId: req.user!.userId,
      tableRef: 'rivers',
      tableName: 'Реки',
      recordId: String(updated.id),
      recordName: updated.name,
      oldValue: { name: oldName },
      newValue: { name: newName },
      description: `Переименована река по имени: ${oldName} → ${newName}`,
    });
    
    res.json({ 
      message: 'Название реки и всех её сегментов обновлено',
      oldName,
      newName,
      segmentsCount
    });
  } catch (error) {
    console.error('Error updating river by name:', error);
    res.status(500).json({ message: 'Ошибка обновления' });
  }
});

router.delete('/rivers/:id', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const river = await prisma.river.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { segments: true }
    });
    
    if (!river) {
      return res.status(404).json({ message: 'Река не найдена' });
    }
    
    await prisma.river.delete({
      where: { id: parseInt(req.params.id) }
    });
    
    const audit = new AuditService();
    await audit.logDelete({
      userId: req.user!.userId,
      tableRef: 'rivers',
      tableName: 'Реки',
      recordId: String(river.id),
      recordName: river.name,
      description: `Удалена река: ${river.name} (вместе с ${river.segments.length} сегментами)`,
    });
    
    res.json({ message: 'Река и все её сегменты удалены' });
  } catch (error) {
    console.error('Error deleting river:', error);
    res.status(500).json({ message: 'Ошибка удаления' });
  }
});

router.get('/rivers/:id/related-data', async (req, res) => {
  try {
    const riverId = parseInt(req.params.id);
    
    const tables = await prisma.dynamicTable.findMany({
      where: {
        linkedToObjects: true,
        objectType: 'RIVER',
      },
      include: {
        records: {
          where: { riverId },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const result: Record<string, any[]> = {};
    
    for (const table of tables) {
      if (table.records.length > 0) {
        result[table.name] = table.records.map(record => {
          const data = record.data as Record<string, any> || {};
          return {
            id: record.id,
            ...data,
            date: record.date,
            year: record.year,
            createdAt: record.createdAt,
          };
        });
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching river related data:', error);
    res.status(500).json({ message: 'Ошибка загрузки связанных данных' });
  }
});

// Инфраструктура

// Базы отдыха
router.get('/accommodation', async (req, res) => {
  const data = await service.getAccommodation();
  res.json(data);
});

router.get('/accommodation/:id', async (req, res) => {
  const item = await prisma.accommodation.findUnique({
    where: { id: parseInt(req.params.id) }
  });
  
  if (!item) {
    return res.status(404).json({ message: 'Не найдено' });
  }
  
  res.json(item);
});

router.post('/accommodation', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, type, address, coordinates } = req.body;
    
    if (!name || !coordinates || !Array.isArray(coordinates)) {
      return res.status(400).json({ message: 'Необходимо указать название и координаты' });
    }
    
    const item = await prisma.accommodation.create({
      data: {
        name,
        type: type || null,
        address,
        coordinates,
        geometry: {
          type: 'Point',
          coordinates: coordinates
        }
      }
    });
    
    const audit = new AuditService();
    await audit.logCreate({
      userId: req.user!.userId,
      tableRef: 'accommodation',
      tableName: 'Базы отдыха',
      recordId: String(item.id),
      recordName: item.name,
      description: `Создана база отдыха: ${item.name}`,
    });
    
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating accommodation:', error);
    res.status(500).json({ message: 'Ошибка создания' });
  }
});

router.patch('/accommodation/:id', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, type, address, coordinates } = req.body;
    
    const oldItem = await prisma.accommodation.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    
    if (!oldItem) {
      return res.status(404).json({ message: 'Не найдено' });
    }
    
    const updateData: any = { name, type: type || null, address };
    
    if (coordinates && Array.isArray(coordinates)) {
      updateData.coordinates = coordinates;
      updateData.geometry = {
        type: 'Point',
        coordinates: coordinates
      };
    }
    
    const updated = await prisma.accommodation.update({
      where: { id: parseInt(req.params.id) },
      data: updateData
    });
    
    const audit = new AuditService();
    await audit.logUpdate({
      userId: req.user!.userId,
      tableRef: 'accommodation',
      tableName: 'Базы отдыха',
      recordId: String(updated.id),
      recordName: updated.name,
      oldValue: { name: oldItem.name, type: oldItem.type, address: oldItem.address },
      newValue: { name: updated.name, type: updated.type, address: updated.address },
      description: `Изменена база отдыха: ${oldItem.name}`,
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating accommodation:', error);
    res.status(500).json({ message: 'Ошибка обновления' });
  }
});

router.delete('/accommodation/:id', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Некорректный ID' });
    }
    
    const item = await prisma.accommodation.findUnique({
      where: { id }
    });
    
    if (!item) {
      return res.status(404).json({ message: 'Не найдено' });
    }
    
    await prisma.accommodation.delete({
      where: { id }
    });
    
    const audit = new AuditService();
    await audit.logDelete({
      userId: req.user!.userId,
      tableRef: 'accommodation',
      tableName: 'Базы отдыха',
      recordId: String(item.id),
      recordName: item.name,
      description: `Удалена база отдыха: ${item.name}`,
    });
    
    res.json({ message: 'База отдыха удалена' });
  } catch (error) {
    console.error('Error deleting accommodation:', error);
    res.status(500).json({ message: 'Ошибка удаления' });
  }
});

router.get('/accommodation/:id/related-data', async (req, res) => {
  try {
    const accommodationId = parseInt(req.params.id);
    
    const tables = await prisma.dynamicTable.findMany({
      where: {
        linkedToObjects: true,
        objectType: 'ACCOMMODATION',
      },
      include: {
        records: {
          where: { accommodationId },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const result: Record<string, any[]> = {};
    
    for (const table of tables) {
      if (table.records.length > 0) {
        result[table.name] = table.records.map(record => {
          const data = record.data as Record<string, any> || {};
          return {
            id: record.id,
            ...data,
            date: record.date,
            year: record.year,
            createdAt: record.createdAt,
          };
        });
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching accommodation related data:', error);
    res.status(500).json({ message: 'Ошибка загрузки связанных данных' });
  }
});

// Турстоянки

router.get('/tourist-stops', async (req, res) => {
  const data = await service.getTouristStops();
  res.json(data);
});

router.get('/tourist-stops/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Некорректный ID' });
  }
  
  const item = await prisma.touristStop.findUnique({
    where: { id }
  });
  
  if (!item) {
    return res.status(404).json({ message: 'Не найдено' });
  }
  
  res.json(item);
});

router.post('/tourist-stops', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, coordinates, description } = req.body;
    
    if (!name || !coordinates || !Array.isArray(coordinates)) {
      return res.status(400).json({ message: 'Необходимо указать название и координаты' });
    }
    
    const item = await prisma.touristStop.create({
      data: {
        name,
        coordinates,
        geometry: {
          type: 'Point',
          coordinates: coordinates
        }
      }
    });
    
    const audit = new AuditService();
    await audit.logCreate({
      userId: req.user!.userId,
      tableRef: 'tourist-stops',
      tableName: 'Турстоянки',
      recordId: String(item.id),
      recordName: item.name,
      description: `Создана турстоянка: ${item.name}`,
    });
    
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating tourist stop:', error);
    res.status(500).json({ message: 'Ошибка создания' });
  }
});

router.patch('/tourist-stops/:id', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Некорректный ID' });
    }
    
    const { name, description, coordinates } = req.body;
    
    const oldItem = await prisma.touristStop.findUnique({
      where: { id }
    });
    
    if (!oldItem) {
      return res.status(404).json({ message: 'Не найдено' });
    }
    
    const updateData: any = { name, description: description || null };
    
    if (coordinates && Array.isArray(coordinates)) {
      updateData.coordinates = coordinates;
      updateData.geometry = {
        type: 'Point',
        coordinates: coordinates
      };
    }
    
    const updated = await prisma.touristStop.update({
      where: { id },
      data: updateData
    });
    
    const audit = new AuditService();
    await audit.logUpdate({
      userId: req.user!.userId,
      tableRef: 'tourist-stops',
      tableName: 'Турстоянки',
      recordId: String(updated.id),
      recordName: updated.name,
      oldValue: { name: oldItem.name },
      newValue: { name: updated.name },
      description: `Изменена турстоянка: ${oldItem.name}`,
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating tourist stop:', error);
    res.status(500).json({ message: 'Ошибка обновления' });
  }
});

router.delete('/tourist-stops/:id', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Некорректный ID' });
    }
    
    const item = await prisma.touristStop.findUnique({
      where: { id }
    });
    
    if (!item) {
      return res.status(404).json({ message: 'Не найдено' });
    }
    
    await prisma.touristStop.delete({
      where: { id }
    });

    const audit = new AuditService();
    await audit.logDelete({
      userId: req.user!.userId,
      tableRef: 'tourist-stops',
      tableName: 'Турстоянки',
      recordId: String(item.id),
      recordName: item.name,
      description: `Удалена турстоянка: ${item.name}`,
    });
    
    res.json({ message: 'Турстоянка удалена' });
  } catch (error) {
    console.error('Error deleting tourist stop:', error);
    res.status(500).json({ message: 'Ошибка удаления' });
  }
});

router.get('/tourist-stops/:id/related-data', async (req, res) => {
  try {
    const touristStopId = parseInt(req.params.id);
    
    const tables = await prisma.dynamicTable.findMany({
      where: {
        linkedToObjects: true,
        objectType: 'TOURIST_STOP',
      },
      include: {
        records: {
          where: { touristStopId },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const result: Record<string, any[]> = {};
    
    for (const table of tables) {
      if (table.records.length > 0) {
        result[table.name] = table.records.map(record => {
          const data = record.data as Record<string, any> || {};
          return {
            id: record.id,
            ...data,
            date: record.date,
            year: record.year,
            createdAt: record.createdAt,
          };
        });
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching tourist stop related data:', error);
    res.status(500).json({ message: 'Ошибка загрузки связанных данных' });
  }
});

// Турорганизаторы

router.get('/tourism-organizers', async (req, res) => {
  const data = await service.getTourismOrganizers();
  res.json(data);
});

router.get('/tourism-organizers/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Некорректный ID' });
  }
  
  const item = await prisma.tourismOrganizer.findUnique({
    where: { id }
  });
  
  if (!item) {
    return res.status(404).json({ message: 'Не найдено' });
  }
  
  res.json(item);
});

router.post('/tourism-organizers', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, type, address, coordinates } = req.body;
    
    if (!name || !coordinates || !Array.isArray(coordinates)) {
      return res.status(400).json({ message: 'Необходимо указать название и координаты' });
    }
    
    const item = await prisma.tourismOrganizer.create({
      data: {
        name,
        type: type || null,
        address,
        coordinates,
        geometry: {
          type: 'Point',
          coordinates: coordinates
        }
      }
    });
    
    const audit = new AuditService();
    await audit.logCreate({
      userId: req.user!.userId,
      tableRef: 'tourism-organizers',
      tableName: 'Турорганизаторы',
      recordId: String(item.id),
      recordName: item.name,
      description: `Создан турорганизатор: ${item.name}`,
    });
    
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating tourism organizer:', error);
    res.status(500).json({ message: 'Ошибка создания' });
  }
});

router.patch('/tourism-organizers/:id', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Некорректный ID' });
    }
    
    const { name, type, address, coordinates } = req.body;
    
    const oldItem = await prisma.tourismOrganizer.findUnique({
      where: { id }
    });
    
    if (!oldItem) {
      return res.status(404).json({ message: 'Не найдено' });
    }
    
    const updateData: any = { 
      name, 
      type: type || null, 
      address 
    };
    
    if (coordinates && Array.isArray(coordinates)) {
      updateData.coordinates = coordinates;
      updateData.geometry = {
        type: 'Point',
        coordinates: coordinates
      };
    }
    
    const updated = await prisma.tourismOrganizer.update({
      where: { id },
      data: updateData
    });
    
    const audit = new AuditService();
    await audit.logUpdate({
      userId: req.user!.userId,
      tableRef: 'tourism-organizers',
      tableName: 'Турорганизаторы',
      recordId: String(updated.id),
      recordName: updated.name,
      oldValue: { name: oldItem.name, type: oldItem.type, address: oldItem.address },
      newValue: { name: updated.name, type: updated.type, address: updated.address },
      description: `Изменён турорганизатор: ${oldItem.name}`,
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating tourism organizer:', error);
    res.status(500).json({ message: 'Ошибка обновления' });
  }
});

router.delete('/tourism-organizers/:id', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Некорректный ID' });
    }
    
    const item = await prisma.tourismOrganizer.findUnique({
      where: { id }
    });
    
    if (!item) {
      return res.status(404).json({ message: 'Не найдено' });
    }
    
    await prisma.tourismOrganizer.delete({
      where: { id }
    });
    
    const audit = new AuditService();
    await audit.logDelete({
      userId: req.user!.userId,
      tableRef: 'tourism-organizers',
      tableName: 'Турорганизаторы',
      recordId: String(item.id),
      recordName: item.name,
      description: `Удалён турорганизатор: ${item.name}`,
    });
    
    res.json({ message: 'Турорганизатор удалён' });
  } catch (error) {
    console.error('Error deleting tourism organizer:', error);
    res.status(500).json({ message: 'Ошибка удаления' });
  }
});

router.get('/tourism-organizers/:id/related-data', async (req, res) => {
  try {
    const organizerId = parseInt(req.params.id);
    
    const tables = await prisma.dynamicTable.findMany({
      where: {
        linkedToObjects: true,
        objectType: 'ORGANIZER',
      },
      include: {
        records: {
          where: { organizerId },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const result: Record<string, any[]> = {};
    
    for (const table of tables) {
      if (table.records.length > 0) {
        result[table.name] = table.records.map(record => {
          const data = record.data as Record<string, any> || {};
          return {
            id: record.id,
            ...data,
            date: record.date,
            year: record.year,
            createdAt: record.createdAt,
          };
        });
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching organizer related data:', error);
    res.status(500).json({ message: 'Ошибка загрузки связанных данных' });
  }
});

export default router;