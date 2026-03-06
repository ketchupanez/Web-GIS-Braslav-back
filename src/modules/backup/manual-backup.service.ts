import { prisma } from '../../shared/database';
import {
  createZipBackup,
  getBackupFiles,
  deleteBackupFile,
  extractBackupData,
  formatFileSize,
  detectBackupType,
} from './backup.utils';
import { BackupFile, CreateBackupResponse, BackupPreview } from './backup.types';
import { AuditService } from '../audit/audit.service';

export class ManualBackupService {
  private audit: AuditService;

  constructor() {
    this.audit = new AuditService();
  }

  async getManualBackups(): Promise<BackupFile[]> {
    const files = getBackupFiles('manual');
    
    return files.map(file => ({
      filename: file.filename,
      type: 'manual' as const,
      createdAt: file.createdAt,
      size: file.size,
      sizeFormatted: formatFileSize(file.size),
    }));
  }

  async createManualBackup(userId: string): Promise<CreateBackupResponse> {
    try {

      const data = await this.collectAllData();
      const { filename, size } = await createZipBackup(data, 'manual');
      
      await this.updateLastManualBackupTime();

      if (userId !== 'system') {
        try {
          await this.audit.logCreate({
            userId,
            tableRef: 'backups',
            tableName: 'Резервные копии',
            recordName: filename,
            description: `Создана ручная резервная копия (${formatFileSize(size)})`,
          });
        } catch (auditError) {
          console.log('Не удалось записать аудит:', auditError);
        }
      }

      console.log(`Ручной бэкап создан: ${filename} (${formatFileSize(size)})`);

      return {
        success: true,
        filename,
        size,
        message: 'Резервная копия успешно создана',
      };
    } catch (error) {
      console.error('Ошибка создания ручного бэкапа:', error);
      throw new Error('Не удалось создать резервную копию');
    }
  }

  async deleteManualBackup(filename: string, userId: string): Promise<void> {
    const success = deleteBackupFile(filename, 'manual');
    
    if (!success) {
      throw new Error('Файл не найден');
    }

    if (userId !== 'system') {
      try {
        await this.audit.logDelete({
          userId,
          tableRef: 'backups',
          tableName: 'Резервные копии',
          recordName: filename,
          description: `Удалена ручная резервная копия`,
        });
      } catch (auditError) {
        console.log('Не удалось записать аудит:', auditError);
      }
    }
  }

  async getBackupPreview(filename: string): Promise<BackupPreview> {
    const type = detectBackupType(filename);
    if (!type) {
      throw new Error('Неверный формат имени файла');
    }

    const { data, metadata } = await extractBackupData(filename, type);
    
    const recordCounts: Record<string, number> = {};
    let totalRecords = 0;

    Object.entries(data).forEach(([table, records]) => {
      recordCounts[table] = records.length;
      totalRecords += records.length;
    });

    return {
      tables: Object.keys(data),
      recordCounts,
      totalRecords,
      createdAt: new Date(metadata.createdAt),
    };
  }

  async restoreFromBackup(
    filename: string, 
    userId: string,
    options: { skipAudit?: boolean } = {}
  ): Promise<void> {
    const type = detectBackupType(filename);
    if (!type) {
      throw new Error('Неверный формат имени файла');
    }

    const { data } = await extractBackupData(filename, type);

    await prisma.$transaction(async (tx) => {
      await this.clearTablesInOrder(tx);
      await this.restoreTablesData(tx, data);
    });

    if (!options.skipAudit && userId !== 'system') {
      try {
        await this.audit.logCreate({
          userId,
          tableRef: 'backups',
          tableName: 'Резервные копии',
          recordName: filename,
          description: `Восстановление из резервной копии: ${filename}`,
        });
      } catch (auditError) {
        console.log('Не удалось записать аудит:', auditError);
      }
    }
  }

  private async collectAllData(): Promise<Record<string, any[]>> {
    const data: Record<string, any[]> = {};

    const tables = [
      { name: 'users', query: prisma.user.findMany() },
      { name: 'lakes', query: prisma.lake.findMany() },
      { name: 'rivers', query: prisma.river.findMany() },
      { name: 'springs', query: prisma.spring.findMany() },
      { name: 'riverSegments', query: prisma.riverSegment.findMany() },
      { name: 'accommodations', query: prisma.accommodation.findMany() },
      { name: 'touristStops', query: prisma.touristStop.findMany() },
      { name: 'tourismOrganizers', query: prisma.tourismOrganizer.findMany() },
      { name: 'dynamicTables', query: prisma.dynamicTable.findMany() },
      { name: 'dynamicRecords', query: prisma.dynamicRecord.findMany() },
      { name: 'chartConfigs', query: prisma.chartConfig.findMany() },
      { name: 'auditLogs', query: prisma.auditLog.findMany() },
    ];

    for (const table of tables) {
      data[table.name] = await table.query;
    }

    return data;
  }

  private async clearTablesInOrder(tx: any): Promise<void> {

    const deleteOrder = [
      { name: 'auditLogs', model: 'auditLog' },
      { name: 'chartConfigs', model: 'chartConfig' },
      { name: 'dynamicRecords', model: 'dynamicRecord' },
      { name: 'dynamicTables', model: 'dynamicTable' },
      { name: 'riverSegments', model: 'riverSegment' },
      { name: 'springs', model: 'spring' },
      { name: 'rivers', model: 'river' },
      { name: 'lakes', model: 'lake' },
      { name: 'touristStops', model: 'touristStop' },
      { name: 'accommodations', model: 'accommodation' },
      { name: 'tourismOrganizers', model: 'tourismOrganizer' },
    ];

    for (const { name, model } of deleteOrder) {
      await tx[model].deleteMany();
    }
  }

  private async restoreTablesData(tx: any, data: Record<string, any[]>): Promise<void> {

    const tableMapping: Record<string, string> = {
      users: 'user',
      lakes: 'lake',
      rivers: 'river',
      springs: 'spring',
      riverSegments: 'riverSegment',
      accommodations: 'accommodation',
      touristStops: 'touristStop',
      tourismOrganizers: 'tourismOrganizer',
      dynamicTables: 'dynamicTable',
      dynamicRecords: 'dynamicRecord',
      chartConfigs: 'chartConfig',
      auditLogs: 'auditLog',
    };

    const restoreOrder = [
      'users',
      'lakes',
      'rivers',
      'springs',
      'riverSegments',
      'accommodations',
      'touristStops',
      'tourismOrganizers',
      'dynamicTables',
      'dynamicRecords',
      'chartConfigs',
      'auditLogs',
    ];

    for (const tableName of restoreOrder) {
      const records = data[tableName];
      if (!records?.length) {
        continue;
      }

      const prismaModel = tableMapping[tableName];
      
      await tx[prismaModel].createMany({
        data: records,
        skipDuplicates: true,
      });
    }
  }

  private async updateLastManualBackupTime(): Promise<void> {
    try {
      const currentSettings = await this.getCurrentSettings();
      
      await prisma.appSettings.upsert({
        where: { key: 'backup_settings' },
        update: {
          value: {
            ...currentSettings,
            lastManualBackup: new Date().toISOString(),
          },
        },
        create: {
          key: 'backup_settings',
          value: {
            autoBackupEnabled: true,
            frequency: 'biweekly',
            dayOfWeek: 5,
            hour: 23,
            minute: 0,
            keepCount: 4,
            lastManualBackup: new Date().toISOString(),
          },
        },
      });
    } catch (err) {
      console.log('Не удалось обновить время бэкапа');
    }
  }

  private async getCurrentSettings(): Promise<any> {
    try {
      const settings = await prisma.appSettings.findUnique({
        where: { key: 'backup_settings' },
      });
      return settings?.value || {};
    } catch {
      return {};
    }
  }
}