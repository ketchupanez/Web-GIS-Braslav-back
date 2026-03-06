import { prisma } from '../../shared/database';
import { CreateChartDto, UpdateChartDto, ChartDataPoint, ChartSource, ChartIndicator, extractYearFromRecord } from './charts.types';

export class ChartsService {
  
  async create(data: CreateChartDto, userId: string) {
    
    if (!userId) {
      throw new Error('User ID is required');
    }

    const { tableId, lakeId, riverId, springId, accommodationId, touristStopId, organizerId, year, objectType, sources, indicators, chartType, name, description } = data;
    
    return prisma.chartConfig.create({
      data: {
        name,
        description,
        tableId,
        lakeId,
        riverId,
        springId,
        accommodationId,
        touristStopId,
        organizerId,
        year,
        objectType,
        sources: sources as any,
        indicators: indicators as any,
        chartType,
        createdBy: userId,
      },
    });
  }

  async getPreviewData(params: {
    tableId: string;
    indicators: ChartIndicator[];
    sources: ChartSource[];
    lakeId?: number;
    riverId?: number;
    springId?: number;
    accommodationId?: number;
    touristStopId?: number;
    organizerId?: number;
  }): Promise<ChartDataPoint[]> {
    const { tableId, indicators, sources, lakeId, riverId, springId, accommodationId, touristStopId, organizerId } = params;
    
    const dataPoints: ChartDataPoint[] = [];
    
    const effectiveSources = sources && sources.length > 0 ? sources : [{ tableId, year: 0, label: 'Данные' }];
    
    for (const source of effectiveSources) {
      const table = await prisma.dynamicTable.findUnique({
        where: { slug: source.tableId },
        include: {
          records: {
            where: this.buildPreviewWhereCondition({ lakeId, riverId, springId, accommodationId, touristStopId, organizerId }),
            include: {
              lake: { select: { name: true } },
              river: { select: { name: true } },
              spring: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      
      if (!table) continue;

      const groupKeyCounter: Record<string, number> = {};
      
      for (const record of table.records) {
        const recordData = record.data as Record<string, any> || {};

        const objectName = 
          record.lake?.name || 
          record.river?.name || 
          record.spring?.name ||
          recordData.name ||
          recordData.station ||
          recordData.object_name ||
          'Объект';
              
        const recordYear = extractYearFromRecord(recordData, source.dateField) || source.year || 0;

        const depthValue = recordData.sampling_depth || recordData.depth || recordData.глубина;
        let normalizedDepth: string | undefined;
        if (depthValue) {
          const depthKey = String(depthValue).toLowerCase().trim();
          if (depthKey.includes('дн') || depthKey.includes('бот')) {
            normalizedDepth = 'дно';
          } else if (depthKey.includes('пов') || depthKey.includes('surf')) {
            normalizedDepth = 'пов.';
          } else {
            normalizedDepth = depthKey;
          }
        }
              
        const baseKey = normalizedDepth 
          ? `${objectName}, ${recordYear}, ${normalizedDepth}`
          : `${objectName}, ${recordYear}`;
              
        const count = groupKeyCounter[baseKey] || 0;
        groupKeyCounter[baseKey] = count + 1;
              
        const groupKey = count > 0 
          ? `${baseKey} (запись ${count + 1})`
          : baseKey;
      
        const point: ChartDataPoint = {
          groupKey,
          year: String(recordYear),
          depth: normalizedDepth || '—',
        };
              
        for (const indicator of indicators) {
          const value = recordData[indicator.key];
          point[indicator.key] = value !== undefined ? Number(value) : null;
        }
              
        dataPoints.push(point);
      }
    }
    
    return dataPoints.sort((a, b) => {
      if (a.groupKey !== b.groupKey) {
        return String(a.groupKey).localeCompare(String(b.groupKey));
      }
      const depthOrder = { 'поверхность': 0, 'дно': 1 };
      const aOrder = depthOrder[a.depth as keyof typeof depthOrder] ?? 2;
      const bOrder = depthOrder[b.depth as keyof typeof depthOrder] ?? 2;
      return aOrder - bOrder;
    });
  }

  private buildPreviewWhereCondition(params: {
    lakeId?: number;
    riverId?: number;
    springId?: number;
    accommodationId?: number;
    touristStopId?: number;
    organizerId?: number;
  }): any {
    const where: any = {};
    if (params.lakeId) where.lakeId = params.lakeId;
    if (params.riverId) where.riverId = params.riverId;
    if (params.springId) where.springId = params.springId;
    if (params.accommodationId) where.accommodationId = params.accommodationId;
    if (params.touristStopId) where.touristStopId = params.touristStopId;
    if (params.organizerId) where.organizerId = params.organizerId;
    return where;
  }

  async findAll(query: {
    userId: string;
    userRole: string;
    groupBy?: string;
    search?: string;
    lakeId?: number;
    riverId?: number;
    year?: number;
    objectType?: string;
    onlyMine?: boolean;
  }) {
    const where: any = {};
    
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    
    if (query.lakeId) where.lakeId = query.lakeId;
    if (query.riverId) where.riverId = query.riverId;
    if (query.year) where.year = query.year;
    if (query.objectType) where.objectType = query.objectType;

    if (query.onlyMine) {
      where.createdBy = query.userId;
    }
    
    const charts = await prisma.chartConfig.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        lake: { select: { id: true, name: true } },
        river: { select: { id: true, name: true } },
        spring: { select: { id: true, name: true } },
      },
    });
    
    if (query.groupBy) {
      return this.groupCharts(charts, query.groupBy);
    }
    
    return charts;
  }

  private groupCharts(charts: any[], groupBy: string) {
    const groups: Record<string, any[]> = {};
    
    for (const chart of charts) {
      let key: string;
      
      switch (groupBy) {
        case 'objectType':
          key = this.getObjectTypeName(chart.objectType);
          break;
        case 'lake':
          key = chart.lake?.name || 'Без озера';
          break;
        case 'river':
          key = chart.river?.name || 'Без реки';
          break;
        case 'spring':
          key = chart.spring?.name || 'Без родника';
          break;
        case 'year':
          const sources = chart.sources as ChartSource[] || [];
          const years = sources.map(s => s.year).filter(Boolean);
          key = years.length > 0 ? String(years[0]) : 'Без года';
          break;
        case 'table':
          key = chart.tableId || 'Без таблицы';
          break;
        default:
          key = 'Все';
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(chart);
    }
    
    const result = Object.entries(groups)
      .map(([name, items]) => ({
        name,
        count: items.length,
        items,
      }))
      .filter(g => g.count > 0);
    
    return result;
  }

  private getObjectTypeName(type: string): string {
    const names: Record<string, string> = {
      'LAKE': 'Озёра',
      'RIVER': 'Реки',
      'SPRING': 'Родники',
      'ACCOMMODATION': 'Базы отдыха',
      'TOURIST_STOP': 'Турстоянки',
      'ORGANIZER': 'Турорганизаторы',
    };
    return names[type] || type;
  }

  async findById(id: string) {
    return prisma.chartConfig.findUnique({
      where: { id },
      include: {
        lake: { select: { id: true, name: true } },
        river: { select: { id: true, name: true } },
        spring: { select: { id: true, name: true } },
      },
    });
  }

  async getChartData(chartId: string): Promise<ChartDataPoint[]> {
    const chart = await prisma.chartConfig.findUnique({
      where: { id: chartId },
    });
    
    if (!chart) throw new Error('График не найден');
    
    const dataPoints: ChartDataPoint[] = [];
    const sources = chart.sources as unknown as ChartSource[];
    const indicators = chart.indicators as unknown as ChartIndicator[];
    
    for (const source of sources) {
      const table = await prisma.dynamicTable.findUnique({
        where: { slug: source.tableId },
        include: {
          records: {
            where: this.buildWhereCondition(chart),
            include: {
              lake: { select: { name: true } },
              river: { select: { name: true } },
              spring: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      
      if (!table) continue;

      const groupKeyCounter: Record<string, number> = {};
      
      for (const record of table.records) {
        const recordData = record.data as Record<string, any> || {};
        
        const objectName = 
          record.lake?.name || 
          record.river?.name || 
          record.spring?.name ||
          recordData.name ||
          recordData.station ||
          recordData.object_name ||
          'Объект';
        
        const recordYear = extractYearFromRecord(recordData, source.dateField) || source.year || 0;
        
        const depthValue = recordData.sampling_depth || recordData.depth || recordData.глубина;
        let normalizedDepth: string | undefined;
        if (depthValue) {
          const depthKey = String(depthValue).toLowerCase().trim();
          if (depthKey.includes('дн') || depthKey.includes('бот')) {
            normalizedDepth = 'дно';
          } else if (depthKey.includes('пов') || depthKey.includes('surf')) {
            normalizedDepth = 'пов.';
          } else {
            normalizedDepth = depthKey;
          }
        }
        
        const baseKey = normalizedDepth 
          ? `${objectName}, ${recordYear}, ${normalizedDepth}`
          : `${objectName}, ${recordYear}`;

        const count = groupKeyCounter[baseKey] || 0;
        groupKeyCounter[baseKey] = count + 1;
        
        const groupKey = count > 0 
          ? `${baseKey} (запись ${count + 1})`
          : baseKey;

        const point: ChartDataPoint = {
          groupKey,
          year: String(recordYear),
          depth: normalizedDepth || '—',
        };
        
        for (const indicator of indicators) {
          const value = recordData[indicator.key];
          point[indicator.key] = value !== undefined ? Number(value) : null;
        }
        
        dataPoints.push(point);
      }
    }
    
    return dataPoints.sort((a, b) => {
      if (a.groupKey !== b.groupKey) {
        return String(a.groupKey).localeCompare(String(b.groupKey));
      }
      const depthOrder = { 'поверхность': 0, 'дно': 1 };
      const aOrder = depthOrder[a.depth as keyof typeof depthOrder] ?? 2;
      const bOrder = depthOrder[b.depth as keyof typeof depthOrder] ?? 2;
      return aOrder - bOrder;
    });
  }

  private buildWhereCondition(chart: any): any {
    const where: any = {};
    
    if (chart.lakeId) where.lakeId = chart.lakeId;
    if (chart.riverId) where.riverId = chart.riverId;
    if (chart.springId) where.springId = chart.springId;
    if (chart.accommodationId) where.accommodationId = chart.accommodationId;
    if (chart.touristStopId) where.touristStopId = chart.touristStopId;
    if (chart.organizerId) where.organizerId = chart.organizerId;
    
    return where;
  }

  async update(id: string, data: UpdateChartDto, userId: string, userRole: string) {
  
    const chart = await prisma.chartConfig.findUnique({
      where: { id },
    });
    
    if (!chart) throw new Error('График не найден');
    
    if (chart.createdBy !== userId && userRole !== 'MAIN_ADMIN' && userRole !== 'SUPER_ADMIN') {
      throw new Error('Нет прав для редактирования');
    }
    
    const updateData: any = {
      ...data,
      updatedAt: new Date(),
    };
    
    if (data.sources) updateData.sources = data.sources as any;
    if (data.indicators) updateData.indicators = data.indicators as any;
    
    return prisma.chartConfig.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string, userId: string, userRole: string) {
    const chart = await prisma.chartConfig.findUnique({
      where: { id },
    });
    
    if (!chart) throw new Error('График не найден');
    
    if (chart.createdBy !== userId && userRole !== 'SUPER_ADMIN') {
      throw new Error('Нет прав для удаления');
    }
    
    return prisma.chartConfig.delete({
      where: { id },
    });
  }

  async findByLake(lakeId: number) {
    return prisma.chartConfig.findMany({
      where: { lakeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByRiver(riverId: number) {
    return prisma.chartConfig.findMany({
      where: { riverId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findBySpring(springId: number) {
    return prisma.chartConfig.findMany({
      where: { springId },
      orderBy: { createdAt: 'desc' },
    });
  }
}