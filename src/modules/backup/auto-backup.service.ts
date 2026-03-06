import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../../shared/database';
import { createZipBackup, cleanupOldAutoBackups, getBackupFiles } from './backup.utils';
import { BackupSettings } from './backup.types';

export class AutoBackupService {
  private static task: ScheduledTask | null = null;
  private static settings: BackupSettings | null = null;

  static async init(): Promise<void> {
    
    await this.loadSettings();
    
    if (!this.settings?.autoBackupEnabled) {
      console.log('⏸Автобэкапы отключены в настройках');
      return;
    }

    this.scheduleBackup();
  }

  static async loadSettings(): Promise<BackupSettings> {
    try {
      const record = await prisma.appSettings.findUnique({
        where: { key: 'backup_settings' },
      });

      if (record && record.value) {
        this.settings = record.value as unknown as BackupSettings;
      } else {
        this.settings = {
          autoBackupEnabled: true,
          frequency: 'biweekly',
          dayOfWeek: 5,
          hour: 23,
          minute: 0,
          keepCount: 4,
          lastAutoBackup: null,
          lastManualBackup: null,
        };
      }
    } catch (err) {
      this.settings = {
        autoBackupEnabled: true,
        frequency: 'biweekly',
        dayOfWeek: 5,
        hour: 23,
        minute: 0,
        keepCount: 4,
      };
    }

    return this.settings;
  }

  static async saveSettings(settings: BackupSettings): Promise<void> {
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "app_settings" (
          "key" TEXT PRIMARY KEY,
          "value" JSONB NOT NULL,
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
    } catch (err) {
      console.log('Таблица appSettings уже существует или ошибка:', err);
    }

    await prisma.appSettings.upsert({
      where: { key: 'backup_settings' },
      update: {
        value: settings as any,
        updatedAt: new Date(),
      },
      create: {
        key: 'backup_settings',
        value: settings as any,
      },
    });

    this.settings = settings;
    
    if (settings.autoBackupEnabled) {
      this.stop();
      this.scheduleBackup();
    } else {
      this.stop();
    }
  }

  private static scheduleBackup(): void {
    if (!this.settings?.autoBackupEnabled) return;

    const { frequency, dayOfWeek, hour, minute } = this.settings;

    let cronExpression: string;

    if (frequency === 'daily') {
      cronExpression = `${minute} ${hour} * * *`;
    } else if (frequency === 'weekly') {
      cronExpression = `${minute} ${hour} * * ${dayOfWeek}`;
    } else {
      cronExpression = `${minute} ${hour} * * ${dayOfWeek}`;
    }

    this.task = cron.schedule(cronExpression, async () => {
      await this.runBackupIfNeeded();
    });
  }

  private static async collectAllData(): Promise<Record<string, any[]>> {
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

  private static async runBackupIfNeeded(): Promise<void> {
    if (!this.settings?.autoBackupEnabled) return;

    const { frequency, keepCount } = this.settings;

    if (frequency === 'biweekly') {
      const lastBackup = this.settings.lastAutoBackup;
      if (lastBackup) {
        const daysSinceLastBackup = 
          (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceLastBackup < 13) {
          console.log(`Пропуск автобэкапа (прошло ${Math.floor(daysSinceLastBackup)} дней)`);
          return;
        }
      }
    }

    console.log('Запуск автобэкапа');

    try {
      const data = await this.collectAllData();
      const { filename, size } = await createZipBackup(data, 'auto');
      
      this.settings.lastAutoBackup = new Date();
      await this.saveSettings(this.settings);

      cleanupOldAutoBackups(keepCount);

      console.log(`Автобэкап завершён успешно: ${filename}`);
    } catch (error) {
      console.error('Ошибка автобэкапа:', error);
    }
  }

  static stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('Автобэкапы остановлены');
    }
  }

  static getStatus(): {
    enabled: boolean;
    scheduled: boolean;
    nextRun: string | null;
    lastRun: string | null;
    settings: BackupSettings | null;
  } {
    const isScheduled = this.task !== null;
    
    let nextRun: string | null = null;
    if (isScheduled && this.settings?.autoBackupEnabled) {
      const now = new Date();
      const { frequency, dayOfWeek, hour, minute, lastAutoBackup } = this.settings;
      
      let next = new Date();
      next.setHours(hour, minute, 0, 0);
      
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      
      if (frequency !== 'daily') {
        while (next.getDay() !== dayOfWeek) {
          next.setDate(next.getDate() + 1);
        }
      }
      
      if ((frequency === 'weekly' || frequency === 'biweekly') && lastAutoBackup) {
        const lastBackup = new Date(lastAutoBackup);
        const minDays = frequency === 'weekly' ? 7 : 14;
        const daysSinceLast = Math.floor((now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysSinceLast < minDays) {
          const daysToAdd = minDays - daysSinceLast;
          next.setDate(now.getDate() + daysToAdd);

          if (frequency === 'weekly' || frequency === 'biweekly') {
            while (next.getDay() !== dayOfWeek) {
              next.setDate(next.getDate() + 1);
            }
          }
        }
      }
      
      nextRun = next.toISOString();
    }
  
    return {
      enabled: this.settings?.autoBackupEnabled ?? false,
      scheduled: isScheduled,
      nextRun,
      lastRun: this.settings?.lastAutoBackup 
        ? new Date(this.settings.lastAutoBackup).toISOString() 
        : null,
      settings: this.settings,
    };
  }

  static async runNow(): Promise<void> {
    console.log('Принудительный запуск автобэкапа (тест)');
    await this.runBackupIfNeeded();
  }
}