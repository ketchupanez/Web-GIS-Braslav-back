import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { prisma } from '../../shared/database';
import { AuditService } from '../audit/audit.service';

const router = Router();

// Функция транслитерации
const transliterate = (text: string): string => {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    ' ': '-', '_': '-', '.': '-', ',': '-', '/': '-', '\\': '-',
  };
  
  return text
    .toLowerCase()
    .split('')
    .map(char => map[char] || char)
    .join('')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
};

// Создать динамическую таблицу
router.post('/', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    
    // Если body пришло как строка, распарсим
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.log('Failed to parse body as JSON');
      }
    }
    
    const { name, slug, category, year, columns, linkedToObjects, objectType, description, categories } = body;
    
    // Проверка name
    if (!name) {
      return res.status(400).json({ message: 'Необходимо указать название таблицы' });
    }
    
    // Проверка categories/columnsConfig существуют
    if (!categories && !category) {
      return res.status(400).json({ message: 'Необходимо указать категорию' });
    }
    
    // Проверка columnsConfig — теперь с более мягкой проверкой
    if (!columns) {
      console.log('ERROR: columnsConfig is falsy:', columns);
      return res.status(400).json({ 
        message: 'Необходимо указать колонки таблицы',
        debug: {
          bodyType: typeof req.body,
          bodyKeys: Object.keys(req.body),
          hasColumnsConfig: 'columnsConfig' in req.body,
          rawColumnsConfig: req.body.columnsConfig
        }
      });
    }
  
    
    // Используем category или categories
    const finalCategory = category || (categories?.[0]) || 'Общее';
    
    // Генерируем slug
    const finalSlug = slug 
      ? slug.toLowerCase().trim()
      : transliterate(name);
    
    // Валидация slug
    const slugRegex = /^[a-z0-9_-]+$/;
    
    if (!slugRegex.test(finalSlug)) {
      console.log('ERROR: Invalid slug format:', finalSlug);
      return res.status(400).json({ 
        message: 'Slug может содержать только a-z, 0-9, _, -',
        slug: finalSlug 
      });
    }

    // Проверка уникальности slug
    console.log('Checking slug uniqueness...');
    const existing = await prisma.dynamicTable.findUnique({
      where: { slug: finalSlug }
    });
    
    let uniqueSlug = finalSlug;
    if (existing) {
      uniqueSlug = `${finalSlug}-${Date.now().toString(36).slice(-4)}`;
      
      const existing2 = await prisma.dynamicTable.findUnique({
        where: { slug: uniqueSlug }
      });
      if (existing2) {
        return res.status(400).json({ message: 'Не удалось сгенерировать уникальный slug' });
      }
    }

    // Валидация columnsConfig
    if (!Array.isArray(columns)) {
      return res.status(400).json({ message: 'columnsConfig должен быть массивом' });
    }
    
    if (columns.length === 0) {
      return res.status(400).json({ message: 'Необходимо указать хотя бы одну колонку' });
    }

    // Валидация каждой колонки
    const validColumns = [];
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      
      if (!col.name) {
        return res.status(400).json({ message: `Колонка ${i + 1}: не указано название` });
      }
      if (!col.key) {
        return res.status(400).json({ message: `Колонка ${i + 1}: не указан ключ` });
      }
      
      validColumns.push({
        id: col.id || `col_${Date.now()}_${i}`,
        name: col.name,
        key: col.key,
        type: col.type || 'text',
        required: col.required || false,
        precision: col.precision,
        options: col.options,
      });
    }

    // Подготовка данных для создания
    const createData = {
      name,
      slug: uniqueSlug,
      category: finalCategory,
      year: year ? parseInt(String(year)) : null,
      description: description || null,
      columnsConfig: validColumns,
      linkedToObjects: linkedToObjects === true,
      objectType: objectType || null,
      createdBy: req.user!.userId,
    };

    const table = await prisma.dynamicTable.create({
      data: createData
    });

    // Логируем
    const audit = new AuditService();
    await audit.logCreate({
      userId: req.user!.userId,
      tableRef: table.slug,
      tableName: table.name,
      description: `Создана таблица: ${table.name}`,
    });
    
    res.status(201).json(table);
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Ошибка создания таблицы', 
      error: error.message,
      code: error.code,
      meta: error.meta
    });
  }
});

// Получить все динамические таблицы
router.get('/', authenticate, async (req, res) => {
  try {
    const tables = await prisma.dynamicTable.findMany({
      include: {
        _count: {
          select: { records: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(tables.map(t => ({
      ...t,
      recordCount: t._count.records,
    })));
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ message: 'Ошибка загрузки таблиц' });
  }
});

// Получить одну таблицу с записями
router.get('/:id', authenticate, async (req, res) => {
  try {
    const table = await prisma.dynamicTable.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { records: true }
        }
      }
    });
    
    if (!table) {
      // Попробуем найти по slug
      const tableBySlug = await prisma.dynamicTable.findUnique({
        where: { slug: req.params.id },
        include: {
          _count: {
            select: { records: true }
          }
        }
      });
      
      if (!tableBySlug) {
        return res.status(404).json({ message: 'Таблица не найдена' });
      }
      
      return res.json({
        ...tableBySlug,
        recordCount: tableBySlug._count.records,
      });
    }
    
    res.json({
      ...table,
      recordCount: table._count.records,
    });
  } catch (error) {
    console.error('Error fetching table:', error);
    res.status(500).json({ message: 'Ошибка загрузки таблицы' });
  }
});

// Удалить динамическую таблицу (только SUPER_ADMIN)
router.delete('/:id', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Ищем по id или slug
    let table = await prisma.dynamicTable.findUnique({ where: { id } });
    if (!table) {
      table = await prisma.dynamicTable.findUnique({ where: { slug: id } });
    }
    
    if (!table) {
      return res.status(404).json({ message: 'Таблица не найдена' });
    }

    // Каскадное удаление записей через onDelete: Cascade в схеме
    await prisma.dynamicTable.delete({
      where: { id: table.id },
    });

    // Логируем
    const audit = new AuditService();
    await audit.logDelete({
      userId: req.user!.userId,
      tableRef: table.slug,
      tableName: table.name,
      description: `Удалена таблица: ${table.name}`,
    });

    res.json({ message: 'Таблица удалена' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ message: 'Ошибка удаления таблицы' });
  }
});

  // ==========================================
// ЗАПИСИ В КАСТОМНЫХ ТАБЛИЦАХ (DynamicRecord)
// ==========================================

// Получить записи таблицы (с фильтрами и связанными объектами)
router.get('/:id/records', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { lakeId, riverId, springId, year, search } = req.query;
    
    // Ищем таблицу по id или по slug
    let table = await prisma.dynamicTable.findUnique({
      where: { id },
      include: {
        records: {
          where: {
            ...(lakeId && { lakeId: parseInt(String(lakeId)) }),
            ...(riverId && { riverId: parseInt(String(riverId)) }),
            ...(springId && { springId: parseInt(String(springId)) }),
            ...(year && { year: parseInt(String(year)) }),
            ...(search && {
              data: {
                path: [],
                string_contains: String(search)
              }
            }),
          },
          include: {
            lake: { select: { id: true, name: true } },
            river: { select: { id: true, name: true } },
            spring: { select: { id: true, name: true } },
            accommodation: { select: { id: true, name: true } },
            touristStop: { select: { id: true, name: true } },
            organizer: { select: { id: true, name: true } },
            user: { select: { fullName: true, login: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    
    // Если не нашли по id, ищем по slug
    if (!table) {
      table = await prisma.dynamicTable.findUnique({
        where: { slug: id },
        include: {
          records: {
            where: {
              ...(lakeId && { lakeId: parseInt(String(lakeId)) }),
              ...(riverId && { riverId: parseInt(String(riverId)) }),
              ...(springId && { springId: parseInt(String(springId)) }),
              ...(year && { year: parseInt(String(year)) }),
              ...(search && {
                data: {
                  path: [],
                  string_contains: String(search)
                }
              }),
            },
            include: {
              lake: { select: { id: true, name: true } },
              river: { select: { id: true, name: true } },
              spring: { select: { id: true, name: true } },
              accommodation: { select: { id: true, name: true } },
              touristStop: { select: { id: true, name: true } },
              organizer: { select: { id: true, name: true } },
              user: { select: { fullName: true, login: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    }
    
    if (!table) {
      return res.status(404).json({ message: 'Таблица не найдена' });
    }
    
    res.json({
      table: {
        id: table.id,
        name: table.name,
        slug: table.slug,
        columnsConfig: table.columnsConfig,
        linkedToObjects: table.linkedToObjects,
        objectType: table.objectType,
      },
      records: table.records,
    });
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ message: 'Ошибка загрузки записей' });
  }
});
  
  // Получить одну запись
  router.get('/:tableId/records/:recordId', authenticate, async (req, res) => {
    try {
      const record = await prisma.dynamicRecord.findUnique({
        where: { 
          id: req.params.recordId,
          tableId: req.params.tableId,
        },
        include: {
          lake: { select: { id: true, name: true } },
          river: { select: { id: true, name: true } },
          spring: { select: { id: true, name: true } },
          accommodation: { select: { id: true, name: true } },
          touristStop: { select: { id: true, name: true } },
          organizer: { select: { id: true, name: true } },
          user: { select: { fullName: true, login: true } },
        },
      });
      
      if (!record) {
        return res.status(404).json({ message: 'Запись не найдена' });
      }
      
      res.json(record);
    } catch (error) {
      res.status(500).json({ message: 'Ошибка загрузки записи' });
    }
  });

  // Создать запись в таблице
router.post('/:id/records', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { data, year, date, lakeId, riverId, springId, accommodationId, touristStopId, organizerId } = req.body;
    
    // Ищем таблицу по id или slug
    let table = await prisma.dynamicTable.findUnique({
      where: { id },
    });
    
    if (!table) {
      table = await prisma.dynamicTable.findUnique({
        where: { slug: id },
      });
    }
    
    if (!table) {
      return res.status(404).json({ message: 'Таблица не найдена' });
    }
    
    const tableId = table.id; // используем реальный id
    
    // Валидация по конфигу колонок
    const config = table.columnsConfig as any[];
    const errors: string[] = [];
    
    config.forEach((col: any) => {
      if (col.required && (data[col.key] === undefined || data[col.key] === '')) {
        errors.push(`Обязательное поле "${col.name}" не заполнено`);
      }
    });
    
    if (errors.length > 0) {
      return res.status(400).json({ message: 'Ошибка валидации', errors });
    }
    
    const record = await prisma.dynamicRecord.create({
      data: {
        tableId: tableId,
        data,
        year: year ? parseInt(year) : null,
        date: date ? new Date(date) : null,
        lakeId: lakeId ? parseInt(lakeId) : null,
        riverId: riverId ? parseInt(riverId) : null,
        springId: springId ? parseInt(springId) : null,
        accommodationId: accommodationId ? parseInt(accommodationId) : null,
        touristStopId: touristStopId ? parseInt(touristStopId) : null,
        organizerId: organizerId ? parseInt(organizerId) : null,
        createdBy: req.user!.userId,
      },
      include: {
        lake: { select: { id: true, name: true } },
        river: { select: { id: true, name: true } },
        spring: { select: { id: true, name: true } },
      },
    });
    
    // Логируем
    const audit = new AuditService();
    await audit.logCreate({
      userId: req.user!.userId,
      tableRef: table.slug,
      tableName: table.name,
      recordId: record.id,
      recordName: (data as any).name || (data as any).station || `Запись ${record.id.slice(0, 8)}`,
      description: `Создана запись в таблице "${table.name}"`,
    });
    
    res.status(201).json(record);
  } catch (error) {
    console.error('Error creating record:', error);
    res.status(500).json({ message: 'Ошибка создания записи' });
  }
});
  
  // Обновить запись
  // Обновить запись
router.patch('/:tableId/records/:recordId', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { tableId, recordId } = req.params;
    const { data, year, date, lakeId, riverId, springId, accommodationId, touristStopId, organizerId } = req.body;
    
    // Ищем таблицу по id или slug
    let table = await prisma.dynamicTable.findUnique({
      where: { id: tableId },
    });
    
    if (!table) {
      table = await prisma.dynamicTable.findUnique({
        where: { slug: tableId },
      });
    }
    
    if (!table) {
      return res.status(404).json({ message: 'Таблица не найдена' });
    }
    
    const realTableId = table.id;
    
    const oldRecord = await prisma.dynamicRecord.findUnique({
      where: { id: recordId },
    });
    
    if (!oldRecord || oldRecord.tableId !== realTableId) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }
    
    // Проверка блокировки (optimistic locking)
    if (oldRecord.lockedBy && oldRecord.lockedBy !== req.user!.userId) {
      const lockedUser = await prisma.user.findUnique({
        where: { id: oldRecord.lockedBy },
        select: { fullName: true },
      });
      return res.status(423).json({ 
        message: `Запись заблокирована пользователем ${lockedUser?.fullName || oldRecord.lockedBy}` 
      });
    }
    
    const updated = await prisma.dynamicRecord.update({
      where: { id: recordId },
      data: {
        data,
        year: year !== undefined ? (year ? parseInt(year) : null) : undefined,
        date: date !== undefined ? (date ? new Date(date) : null) : undefined,
        lakeId: lakeId !== undefined ? (lakeId ? parseInt(lakeId) : null) : undefined,
        riverId: riverId !== undefined ? (riverId ? parseInt(riverId) : null) : undefined,
        springId: springId !== undefined ? (springId ? parseInt(springId) : null) : undefined,
        accommodationId: accommodationId !== undefined ? (accommodationId ? parseInt(accommodationId) : null) : undefined,
        touristStopId: touristStopId !== undefined ? (touristStopId ? parseInt(touristStopId) : null) : undefined,
        organizerId: organizerId !== undefined ? (organizerId ? parseInt(organizerId) : null) : undefined,
        updatedAt: new Date(),
      },
    });
    
    // Логируем
    const audit = new AuditService();
    await audit.logUpdate({
      userId: req.user!.userId,
      tableRef: table.slug,
      tableName: table.name,
      recordId: updated.id,
      recordName: (data as any).name || (data as any).station || `Запись ${updated.id.slice(0, 8)}`,
      oldValue: oldRecord.data,
      newValue: data,
      description: `Изменена запись в таблице "${table.name}"`,
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating record:', error);
    res.status(500).json({ message: 'Ошибка обновления записи' });
  }
});
  
  // Удалить запись
  // Удалить запись
router.delete('/:tableId/records/:recordId', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { tableId, recordId } = req.params;
    
    // Ищем таблицу по id или slug
    let table = await prisma.dynamicTable.findUnique({
      where: { id: tableId },
    });
    
    if (!table) {
      table = await prisma.dynamicTable.findUnique({
        where: { slug: tableId },
      });
    }
    
    if (!table) {
      return res.status(404).json({ message: 'Таблица не найдена' });
    }
    
    const realTableId = table.id;
    
    const record = await prisma.dynamicRecord.findUnique({
      where: { id: recordId },
    });
    
    if (!record || record.tableId !== realTableId) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }
    
    await prisma.dynamicRecord.delete({
      where: { id: recordId },
    });
    
    // Логируем
    const audit = new AuditService();
    await audit.logDelete({
      userId: req.user!.userId,
      tableRef: table.slug,
      tableName: table.name,
      recordId: record.id,
      recordName: (record.data as any)?.name || (record.data as any)?.station || `Запись ${record.id.slice(0, 8)}`,
      description: `Удалена запись из таблицы "${table.name}"`,
    });
    
    res.json({ message: 'Запись удалена' });
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ message: 'Ошибка удаления записи' });
  }
});
  
 // Блокировка записи для редактирования (optimistic locking)
router.post('/:tableId/records/:recordId/lock', authenticate, async (req, res) => {
  try {
    const { tableId, recordId } = req.params;
    
    // Ищем таблицу по id или slug
    let table = await prisma.dynamicTable.findUnique({
      where: { id: tableId },
    });
    
    if (!table) {
      table = await prisma.dynamicTable.findUnique({
        where: { slug: tableId },
      });
    }
    
    if (!table) {
      return res.status(404).json({ message: 'Таблица не найдена' });
    }
    
    const record = await prisma.dynamicRecord.update({
      where: { id: recordId },
      data: {
        lockedBy: req.user!.userId,
        lockedAt: new Date(),
      },
    });
    
    res.json(record);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка блокировки записи' });
  }
});

// Разблокировка записи
router.post('/:tableId/records/:recordId/unlock', authenticate, async (req, res) => {
  try {
    const { tableId, recordId } = req.params;
    
    // Ищем таблицу по id или slug
    let table = await prisma.dynamicTable.findUnique({
      where: { id: tableId },
    });
    
    if (!table) {
      table = await prisma.dynamicTable.findUnique({
        where: { slug: tableId },
      });
    }
    
    if (!table) {
      return res.status(404).json({ message: 'Таблица не найдена' });
    }
    
    const record = await prisma.dynamicRecord.findUnique({
      where: { id: recordId },
    });
    
    // Только тот, кто заблокиров, или супер-админ может разблокировать
    if (record?.lockedBy && record.lockedBy !== req.user!.userId && req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Нельзя разблокировать чужую запись' });
    }
    
    const updated = await prisma.dynamicRecord.update({
      where: { id: recordId },
      data: {
        lockedBy: null,
        lockedAt: null,
      },
    });
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка разблокировки записи' });
  }
});

export default router;