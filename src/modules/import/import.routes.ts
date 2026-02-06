import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { prisma } from '../../shared/database';
import { AuditService } from '../audit/audit.service';
import * as XLSX from 'xlsx';

const router = Router();

// Загрузить и распарсить Excel (только превью, без сохранения)
router.post('/preview', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    // В реальности здесь multer для загрузки файла
    // Сейчас упрощённая версия — данные приходят как base64 или уже распарсенные
    const { data, sheetName } = req.body;
    
    const workbook = XLSX.read(data, { type: 'base64' });
    const worksheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    
    if (jsonData.length < 2) {
      return res.status(400).json({ message: 'Файл должен содержать заголовки и данные' });
    }
    
    const headers = jsonData[0];
    const rows = jsonData.slice(1, 11); // Первые 10 строк для превью
    
    res.json({
      headers,
      previewRows: rows,
      totalRows: jsonData.length - 1,
      sheets: workbook.SheetNames,
    });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ message: 'Ошибка обработки файла' });
  }
});

// Импорт данных в таблицу
router.post('/execute', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { tableId, tableType, data, mapping, linkToObjects } = req.body;
    // tableType: 'system' | 'custom'
    // mapping: { excelColIndex: fieldName }
    // linkToObjects: { field: 'name', autoMatch: boolean }
    
    const audit = new AuditService();
    let created = 0;
    let updated = 0;
    let errors: string[] = [];
    
    // Получаем существующие объекты для матчинга
    const existingObjects = linkToObjects ? await prisma.lake.findMany({
      select: { id: true, name: true }
    }) : [];
    
    for (const row of data) {
      try {
        const mappedData: any = {};
        
        // Маппим колонки
        Object.entries(mapping).forEach(([colIndex, fieldName]) => {
          mappedData[fieldName as string] = row[parseInt(colIndex)];
        });
        
        // Авто-привязка к объекту по названию
        let linkedObjectId: string | null = null;
        if (linkToObjects && mappedData[linkToObjects.field]) {
          const match = existingObjects.find(obj => 
            obj.name.toLowerCase().includes(mappedData[linkToObjects.field].toLowerCase())
          );
          if (match) linkedObjectId = match.id;
        }
        
        if (tableType === 'system') {
          // Для системных таблиц — создаём записи через geo routes логику
          // Пока упрощённо — создаём озёра
          if (tableId === 'lakes') {
            await prisma.lake.create({
              data: {
                name: mappedData.name,
                areaHa: parseFloat(mappedData.area_ha) || null,
                center: mappedData.coordinates ? JSON.parse(mappedData.coordinates) : null,
                geometry: mappedData.coordinates ? 
                  JSON.stringify({
                    type: 'Point',
                    coordinates: JSON.parse(mappedData.coordinates)
                  }
                ) as any : undefined,
              }
            });
            created++;
          }
          // ... другие системные таблицы
        } else {
          // Для кастомных таблиц — DynamicRecord
          await prisma.dynamicRecord.create({
            data: {
              tableId,
              data: mappedData,
              lakeId: linkedObjectId, // или другой тип объекта
              createdBy: req.user!.userId,
            }
          });
          created++;
        }
      } catch (err: any) {
        errors.push(`Ошибка в строке: ${err.message}`);
      }
    }
    
    // Логируем импорт
    await audit.log({
      userId: req.user!.userId,
      action: 'IMPORT',
      tableRef: tableId,
      tableName: tableType === 'system' ? 'Системная таблица' : 'Кастомная таблица',
      description: `Импортировано ${created} записей, обновлено ${updated}, ошибок ${errors.length}`,
    });
    
    res.json({ created, updated, errors, total: data.length });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ message: 'Ошибка импорта' });
  }
});

export default router;