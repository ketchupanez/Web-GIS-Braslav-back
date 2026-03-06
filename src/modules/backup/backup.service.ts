import { ManualBackupService } from './manual-backup.service';
import { AutoBackupService } from './auto-backup.service';
import { BackupFile, BackupSettings, CreateBackupResponse, BackupPreview } from './backup.types';
import { getBackupFiles, formatFileSize, getBackupFilePath, deleteBackupFile } from './backup.utils';

export class BackupService {
  private manualService: ManualBackupService;

  constructor() {
    this.manualService = new ManualBackupService();
  }

  // Ручные бэкапы

  async getManualBackups(): Promise<BackupFile[]> {
    return this.manualService.getManualBackups();
  }

  async createManualBackup(userId: string): Promise<CreateBackupResponse> {
    return this.manualService.createManualBackup(userId);
  }

  async deleteManualBackup(filename: string, userId: string): Promise<void> {
    return this.manualService.deleteManualBackup(filename, userId);
  }

  // Авто

  async getAutoBackups(): Promise<BackupFile[]> {
    const files = getBackupFiles('auto');
    return files.map(file => ({
      filename: file.filename,
      type: 'auto' as const,
      createdAt: file.createdAt,
      size: file.size,
      sizeFormatted: formatFileSize(file.size),
    }));
  }

  async getAutoBackupStatus() {
    return AutoBackupService.getStatus();
  }

  async getBackupSettings(): Promise<BackupSettings> {
    return AutoBackupService.loadSettings();
  }

  async updateBackupSettings(settings: BackupSettings): Promise<BackupSettings> {
    await AutoBackupService.saveSettings(settings);
    return settings;
  }

  // async runAutoBackupNow(): Promise<void> {
  //   return AutoBackupService.runNow();
  // }

  // Общее

  async getAllBackups(): Promise<BackupFile[]> {
    const [manual, auto] = await Promise.all([
      this.getManualBackups(),
      this.getAutoBackups(),
    ]);

    return [...manual, ...auto].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async getBackupPreview(filename: string): Promise<BackupPreview> {
    return this.manualService.getBackupPreview(filename);
  }

  async restoreFromBackup(filename: string, userId: string): Promise<void> {
    return this.manualService.restoreFromBackup(filename, userId);
  }

  async deleteBackup(filename: string, type: 'manual' | 'auto', userId: string): Promise<void> {
    if (type === 'manual') {
      await this.manualService.deleteManualBackup(filename, userId);
    } else {
      const success = deleteBackupFile(filename, 'auto');
      if (!success) {
        throw new Error('Файл автобэкапа не найден');
      }
    }
  }

  getBackupFilePath(filename: string, type: 'manual' | 'auto'): string {
    return getBackupFilePath(filename, type);
  }
}