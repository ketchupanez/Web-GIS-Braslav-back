export interface BackupFile {
    filename: string;
    type: 'manual' | 'auto';
    createdAt: Date;
    size: number;
    sizeFormatted: string;
  }
  
  export interface BackupSettings {
    id?: string;
    autoBackupEnabled: boolean;
    frequency: 'daily' | 'weekly' | 'biweekly';
    dayOfWeek: number;
    hour: number;
    minute: number;
    keepCount: number;
    lastAutoBackup?: Date | string | null;
    lastManualBackup?: Date | string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }
  
  export interface CreateBackupResponse {
    success: boolean;
    filename: string;
    size: number;
    message?: string;
  }
  
  export interface RestoreBackupRequest {
    filename: string;
    confirm: boolean;
  }
  
  export interface BackupPreview {
    tables: string[];
    recordCounts: Record<string, number>;
    totalRecords: number;
    createdAt: Date;
  }