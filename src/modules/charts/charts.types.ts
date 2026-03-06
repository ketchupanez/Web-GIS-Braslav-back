export interface ChartIndicator {
    key: string;
    name: string;
    color: string;
    unit: string;
  }
  
  export interface ChartSource {
    tableId: string;
    year?: number;
    label?: string;
    dateField?: 'auto' | 'none' | string;
  }
  
  export interface CreateChartDto {
    name: string;
    description?: string;
    tableId: string;
    lakeId?: number;
    riverId?: number;
    springId?: number;
    accommodationId?: number;
    touristStopId?: number;
    organizerId?: number;
    year?: number;
    objectType: string;
    sources: ChartSource[];
    indicators: ChartIndicator[];
    chartType: 'stackedBar' | 'groupedBar';
  }
  
  export interface UpdateChartDto {
    name?: string;
    description?: string;
    sources?: ChartSource[];
    indicators?: ChartIndicator[];
    chartType?: 'stackedBar' | 'groupedBar';
  }
  
  export function extractYearFromRecord(
    recordData: Record<string, any>,
    dateFieldHint?: string
  ): number | null {

    const dateFields = dateFieldHint 
      ? [dateFieldHint, 'date', 'sampling_date', 'year', 'дата', 'год', 'samplingDate']
      : ['date', 'sampling_date', 'year', 'дата', 'год', 'samplingDate'];
    
    for (const field of dateFields) {
      const value = recordData[field];
      if (!value) continue;

      if (typeof value === 'number' && value > 1900 && value < 2100) {
        return value;
      }
      
      if (typeof value === 'string') {
        const ddmmyyMatch = value.match(/(\d{2})\.(\d{2})\.(\d{2})/);
        if (ddmmyyMatch) {
          let year = parseInt(ddmmyyMatch[3]);
          year = year < 50 ? 2000 + year : 1900 + year;
          return year;
        }
        
        const isoMatch = value.match(/(\d{4})[-./](\d{2})/) || 
                        value.match(/(\d{2})[-./](\d{2})[-./](\d{4})/);
        if (isoMatch) {
          const yearStr = isoMatch[1].length === 4 ? isoMatch[1] : isoMatch[3];
          return parseInt(yearStr);
        }
        
        if (/^\d{4}$/.test(value)) {
          return parseInt(value);
        }
      }

      if (value instanceof Date) {
        return value.getFullYear();
      }
    }
    
    return null;
  }

  export interface ChartDataPoint {
    groupKey: string;
    year: string;
    depth?: string;
    [key: string]: any;
  }