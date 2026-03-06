import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { prisma } from '../../shared/database';
import { AuditService } from '../audit/audit.service';
import * as XLSX from 'xlsx';

const router = Router();

function generateDuplicateKey(
  tableId: string,
  mappedData: any,
  columnsConfig: any[],
  lakeId?: number | null,
  riverId?: number | null,
  springId?: number | null,
  year?: number | null
): string {
  const parts: string[] = [tableId];
  
  if (lakeId) parts.push(`lake:${lakeId}`);
  if (riverId) parts.push(`river:${riverId}`);
  if (springId) parts.push(`spring:${springId}`);
  if (year) parts.push(`year:${year}`);
  
  const dataEntries = columnsConfig
    .filter((col) => !col.key.startsWith('_'))
    .map((col) => {
      const key = col.key;
      const value = mappedData[key];

      let normalized: string;
      if (value === undefined || value === null || value === '') {
        normalized = '__EMPTY__';
      } else {
        normalized = String(value).trim().toLowerCase();
        const num = parseFloat(normalized);
        if (!isNaN(num) && normalized.match(/^-?\d+\.?\d*$/)) {
          normalized = num.toFixed(4);
        }
      }
      return `${key}:${normalized}`;
    })
    .sort();
  
  if (dataEntries.length > 0) {
    parts.push(`data:${dataEntries.join('|')}`);
  }
  
  return parts.join('::');
}

const normalizeString = (str: string): string => {
  if (!str) return '';
  return str
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/g, '')
    .replace(/[^a-zа-яё0-9]/g, '')
    .trim();
};

const similarity = (s1: string, s2: string): number => {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
};

const levenshteinDistance = (s1: string, s2: string): number => {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
};

router.post('/preview', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { data, sheetName } = req.body;
    
    if (!data) {
      return res.status(400).json({ message: 'Не предоставлены данные файла' });
    }
    
    const workbook = XLSX.read(data, { type: 'base64' });
    const worksheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    
    if (jsonData.length < 2) {
      return res.status(400).json({ message: 'Файл должен содержать заголовки и данные' });
    }
    
    const headers = jsonData[0].map(h => String(h).trim());
    const previewRows = jsonData.slice(1, 11);
    
    const dataRows = jsonData.slice(1);
    const nonEmptyRows = dataRows.filter(row => 
      row.some(cell => cell !== undefined && cell !== '' && cell !== null)
    );
    
    res.json({
      headers,
      previewRows,
      totalRows: nonEmptyRows.length,
      sheets: workbook.SheetNames,
    });
  } catch (error: any) {
    console.error('Preview error:', error);
    res.status(500).json({ message: 'Ошибка обработки файла', error: error.message });
  }
});

router.post('/execute', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { tableId, tableType, data, mapping, linkToObjects } = req.body;
    
    if (!data || !mapping || !tableId) {
      return res.status(400).json({ 
        message: 'Необходимы данные файла, маппинг и ID таблицы' 
      });
    }

    let tableConfig = await prisma.dynamicTable.findUnique({
      where: { id: tableId }
    });

    if (!tableConfig) {
      tableConfig = await prisma.dynamicTable.findUnique({
        where: { slug: tableId }
      });
    }

    if (!tableConfig) {
      return res.status(404).json({ message: 'Таблица не найдена' });
    }

    const actualTableId = tableConfig.id;
    const audit = new AuditService();
    let created = 0;
    let updated = 0;
    let errors: string[] = [];
    
    const workbook = XLSX.read(data, { type: 'base64' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    
    if (jsonData.length < 2) {
      return res.status(400).json({ message: 'Файл должен содержать заголовки и данные' });
    }
    
    const headers = jsonData[0].map(h => String(h).trim());
    const rows = jsonData.slice(1);

    let existingObjects: any[] = [];
    let objectType: string | null = tableConfig.objectType || linkToObjects?.objectType || null;
    
    if (!objectType && tableConfig.linkedToObjects && linkToObjects?.autoMatch) {
      objectType = detectObjectType(tableId);
    }
    
    if (objectType) {
      existingObjects = await fetchObjectsByType(objectType);
    }
    
    for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex--) {
      const row = rows[rowIndex];
      const rowNum = rowIndex + 2;
      
      try {
        const hasAnyData = row.some(cell => cell !== undefined && cell !== '' && cell !== null);
        if (!hasAnyData) continue;

        const mappedData: any = {};
        
        Object.entries(mapping).forEach(([fieldName, colIndex]) => {
          const idx = typeof colIndex === 'string' ? parseInt(colIndex, 10) : colIndex;
          if (typeof idx === 'number' && Number.isFinite(idx) && idx >= 0 && idx < row.length) {
            const value = row[idx as number];
            mappedData[fieldName] = (value === undefined || value === '') ? null : value;
          } else {
            mappedData[fieldName] = null;
          }
        });
        
        const hasMeaningfulData = Object.entries(mappedData).some(([key, value]) => {
          if (key.startsWith('_')) return false;
          return value !== null && value !== '';
        });
        
        if (!hasMeaningfulData) continue;
        
        if (tableConfig?.columnsConfig) {
          const columns = tableConfig.columnsConfig as any[];
          for (const col of columns) {
            if (col.required && (mappedData[col.key] === undefined || mappedData[col.key] === '' || mappedData[col.key] === null)) {
              throw new Error(`Строка ${rowNum}: обязательное поле "${col.name}" не заполнено`);
            }

            if (mappedData[col.key] !== undefined && mappedData[col.key] !== '' && mappedData[col.key] !== null) {
              if (col.type === 'number') {
                const numVal = parseFloat(mappedData[col.key]);
                if (isNaN(numVal)) {
                  throw new Error(`Строка ${rowNum}: поле "${col.name}" должно быть числом`);
                }
                mappedData[col.key] = numVal;
              } else if (col.type === 'date') {
                const dateVal = new Date(mappedData[col.key]);
                if (isNaN(dateVal.getTime())) {
                  throw new Error(`Строка ${rowNum}: поле "${col.name}" должно быть датой`);
                }
                mappedData[col.key] = dateVal.toISOString();
              }
            }
          }
        }
        
        let linkedObjectId: number | null = null;
        let linkedObjectType: string | null = null;

        const lakeNameFields = ['lake_name', 'ozero', 'озеро', 'name', 'n_proby', 'n_probi', 'пробы', 'object_name'];
        let objectName: string | null = null;

        for (const field of lakeNameFields) {
          if (mappedData[field]) {
            objectName = String(mappedData[field]).trim();
            break;
          }
        }

        if (!objectName && headers[0]) {
          const firstColValue = String(row[0] || '').trim();
          if (firstColValue && !/^\d+$/.test(firstColValue) && !/^\d{4}/.test(firstColValue)) {
            objectName = firstColValue;
          }
        }

        if (objectName && existingObjects.length > 0) {
          const searchName = normalizeString(objectName);
          
          let bestMatch: any = null;
          let bestScore = 0;
          
          for (const obj of existingObjects) {
            const objName = normalizeString(obj.name);
            const score = similarity(searchName, objName);
            
            if (objName === searchName) {
              bestMatch = obj;
              bestScore = 1.0;
              break;
            }

            if (objName.includes(searchName) || searchName.includes(objName)) {
              const partialScore = 0.8;
              if (partialScore > bestScore) {
                bestScore = partialScore;
                bestMatch = obj;
              }
            }
            
            if (score > bestScore && score > 0.6) {
              bestScore = score;
              bestMatch = obj;
            }
          }
          
          if (bestMatch) {
            linkedObjectId = bestMatch.id;
            linkedObjectType = objectType;
            mappedData._matchedObjectName = bestMatch.name;
          } else {
            errors.push(`Строка ${rowNum}: не удалось привязать объект "${objectName}"`);
          }
        }
        
        let yearValue: number | null = null;
        if (mappedData.year) {
          yearValue = parseInt(String(mappedData.year));
        }

        const recordKey = generateDuplicateKey(
          actualTableId,
          mappedData,
          tableConfig.columnsConfig as any[],
          linkedObjectId || undefined,
          undefined,
          undefined,
          yearValue || undefined
        );

        const existingRecords = await prisma.dynamicRecord.findMany({
          where: {
            tableId: actualTableId,
            year: yearValue,
            ...(linkedObjectId && linkedObjectType ? {
              [getObjectTypeField(linkedObjectType)!]: linkedObjectId
            } : {}),
          },
          take: 100,
        });

        let existingRecord = null;
        for (const existing of existingRecords) {
          const existingKey = generateDuplicateKey(
            actualTableId,
            existing.data as any,
            tableConfig.columnsConfig as any[],
            existing.lakeId || undefined,
            existing.riverId || undefined,
            existing.springId || undefined,
            existing.year || undefined
          );
          
          if (existingKey === recordKey) {
            existingRecord = existing;
            break;
          }
        }

        if (existingRecord) {
          const mergedData = { ...existingRecord.data as any };
          
          Object.entries(mappedData).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
              mergedData[key] = value;
            }
          });
          
          await prisma.dynamicRecord.update({
            where: { id: existingRecord.id },
            data: { 
              data: mergedData,
            }
          });
          
          updated++;
          continue;
        }
        
        if (tableType === 'system') {
          await importToSystemTable(tableId, mappedData, linkedObjectId, linkedObjectType);
          created++;
        } else {
          const createData: any = {
            tableId: actualTableId,
            data: mappedData,
            year: yearValue,
            createdBy: req.user!.userId,
          };
          
          if (linkedObjectId && linkedObjectType) {
            const typeField = getObjectTypeField(linkedObjectType);
            if (typeField) {
              createData[typeField] = linkedObjectId;
            }
          }
          
          await prisma.dynamicRecord.create({ data: createData });
          created++;
        }
      } catch (err: any) {
        errors.push(`Строка ${rowNum}: ${err.message}`);
      }
    }
    

    await audit.log({
    userId: req.user!.userId,
    action: 'IMPORT',
    tableRef: tableId,
    tableName: tableType === 'system' ? 'Системная таблица' : (tableConfig?.name || 'Кастомная таблица'),
    description: `Импорт: создано ${created}, обновлено ${updated}, ошибок ${errors.length}`,
  });
    
    const skipped = rows.length - created - errors.length;
    res.json({ created, updated, skipped, errors, total: rows.length });
  } catch (error: any) {
    console.error('Import error:', error);
    res.status(500).json({ message: 'Ошибка импорта', error: error.message });
  }
});

function detectObjectType(tableId: string): string | null {
  const lowerId = tableId.toLowerCase();
  
  if (lowerId.includes('lake') || lowerId.includes('озер')) return 'LAKE';
  if (lowerId.includes('river') || lowerId.includes('рек')) return 'RIVER';
  if (lowerId.includes('spring') || lowerId.includes('родник')) return 'SPRING';
  if (lowerId.includes('accommodation') || lowerId.includes('база')) return 'ACCOMMODATION';
  if (lowerId.includes('tourist') || lowerId.includes('турстоян')) return 'TOURIST_STOP';
  if (lowerId.includes('organizer') || lowerId.includes('организатор')) return 'ORGANIZER';
  
  return null;
}

function getObjectTypeField(type: string): string | null {
  const fieldMap: Record<string, string> = {
    'LAKE': 'lakeId',
    'RIVER': 'riverId',
    'SPRING': 'springId',
    'ACCOMMODATION': 'accommodationId',
    'TOURIST_STOP': 'touristStopId',
    'ORGANIZER': 'organizerId',
  };
  return fieldMap[type] || null;
}

async function fetchObjectsByType(type: string): Promise<any[]> {
  switch (type) {
    case 'LAKE':
      return await prisma.lake.findMany({ select: { id: true, name: true } });
    case 'RIVER':
      return await prisma.river.findMany({ select: { id: true, name: true } });
    case 'SPRING':
      return await prisma.spring.findMany({ select: { id: true, name: true } });
    case 'ACCOMMODATION':
      return await prisma.accommodation.findMany({ select: { id: true, name: true } });
    case 'TOURIST_STOP':
      return await prisma.touristStop.findMany({ select: { id: true, name: true } });
    case 'ORGANIZER':
      return await prisma.tourismOrganizer.findMany({ select: { id: true, name: true } });
    default:
      return [];
  }
}

async function importToSystemTable(
  tableId: string, 
  data: any, 
  linkedObjectId: number | null,
  linkedObjectType: string | null
): Promise<void> {
  switch (tableId) {
    case 'lakes': {
      const center = parseCoordinates(data.center);
      const createData: any = {
        name: data.name,
        areaHa: data.area_ha ? parseFloat(data.area_ha) : undefined,
      };
      
      if (center) {
        createData.center = center;
        createData.geometry = {
          type: 'Point',
          coordinates: center
        };
      }
      
      await prisma.lake.create({ data: createData });
      break;
    }
      
    case 'springs': {
      const coordinates = parseCoordinates(data.coordinates);
      const createData: any = {
        name: data.name,
        riverId: data.riverId ? parseInt(data.riverId) : undefined,
      };
      
      if (coordinates) {
        createData.coordinates = coordinates;
        createData.geometry = {
          type: 'Point',
          coordinates: coordinates
        };
      }
      
      await prisma.spring.create({ data: createData });
      break;
    }
      
    case 'rivers': {
      const river = await prisma.river.create({
        data: { name: data.name }
      });
      
      if (data.geometry) {
        let geometry = data.geometry;
        if (typeof data.geometry === 'string') {
          try {
            geometry = JSON.parse(data.geometry);
          } catch {
          }
        }
        
        if (geometry && geometry.type) {
          await prisma.riverSegment.create({
            data: {
              riverId: river.id,
              geometry: geometry,
              order: 0
            }
          });
        }
      }
      break;
    }
      
    case 'accommodation': {
      const coordinates = parseCoordinates(data.coordinates);
      const createData: any = {
        name: data.name,
        type: data.type || undefined,
        address: data.address || undefined,
      };
      
      if (coordinates) {
        createData.coordinates = coordinates;
        createData.geometry = {
          type: 'Point',
          coordinates: coordinates
        };
      }
      
      await prisma.accommodation.create({ data: createData });
      break;
    }
      
    case 'tourist-stops': {
      const coordinates = parseCoordinates(data.coordinates);
      const createData: any = {
        name: data.name,
      };
      
      if (coordinates) {
        createData.coordinates = coordinates;
        createData.geometry = {
          type: 'Point',
          coordinates: coordinates
        };
      }
      
      await prisma.touristStop.create({ data: createData });
      break;
    }
      
    case 'tourism-organizers': {
      const coordinates = parseCoordinates(data.coordinates);
      const createData: any = {
        name: data.name,
        type: data.type || undefined,
        address: data.address || undefined,
      };
      
      if (coordinates) {
        createData.coordinates = coordinates;
        createData.geometry = {
          type: 'Point',
          coordinates: coordinates
        };
      }
      
      await prisma.tourismOrganizer.create({ data: createData });
      break;
    }
      
    default:
      throw new Error(`Неизвестная системная таблица: ${tableId}`);
  }
}

function parseCoordinates(value: any): number[] | undefined {
  if (!value) return undefined;
  
  if (Array.isArray(value) && value.length === 2) {
    const lat = parseFloat(value[0]);
    const lon = parseFloat(value[1]);
    if (!isNaN(lat) && !isNaN(lon)) {
      return [lat, lon];
    }
    return undefined;
  }
  
  const str = String(value).trim();
  const bracketMatch = str.match(/\[?\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*\]?/);
  if (bracketMatch) {
    const lat = parseFloat(bracketMatch[1]);
    const lon = parseFloat(bracketMatch[2]);
    if (!isNaN(lat) && !isNaN(lon)) {
      return [lat, lon];
    }
  }
  
  return undefined;
}

export default router;