import { Request, Response, NextFunction } from 'express';
import { BackupService } from './backup.service';
import { backupSettingsSchema, restoreBackupSchema } from './backup.validation';
import { ZodError } from 'zod';

export class BackupController {
  private service: BackupService;

  constructor() {
    this.service = new BackupService();
  }

  getAllBackups = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const backups = await this.service.getAllBackups();
      res.json(backups);
    } catch (error) {
      next(error);
    }
  };

  getManualBackups = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const backups = await this.service.getManualBackups();
      res.json(backups);
    } catch (error) {
      next(error);
    }
  };

  getAutoBackups = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const backups = await this.service.getAutoBackups();
      res.json(backups);
    } catch (error) {
      next(error);
    }
  };

  createManualBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createManualBackup(req.user!.userId);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filename } = req.params;
      const { type } = req.query as { type: 'manual' | 'auto' };

      if (!type || !['manual', 'auto'].includes(type)) {
        return res.status(400).json({ message: 'Укажите тип бэкапа (manual или auto)' });
      }

      await this.service.deleteBackup(filename, type, req.user!.userId);
      res.json({ message: 'Резервная копия удалена' });
    } catch (error) {
      next(error);
    }
  };

  downloadBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filename } = req.params;
      const { type } = req.query as { type: 'manual' | 'auto' };

      if (!type || !['manual', 'auto'].includes(type)) {
        return res.status(400).json({ message: 'Укажите тип бэкапа' });
      }

      const filePath = this.service.getBackupFilePath(filename, type);
      res.download(filePath, filename);
    } catch (error) {
      next(error);
    }
  };

  getBackupPreview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filename } = req.params;
      const preview = await this.service.getBackupPreview(filename);
      res.json(preview);
    } catch (error) {
      next(error);
    }
  };

  restoreBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = restoreBackupSchema.parse(req.body);
      
      await this.service.restoreFromBackup(validated.filename, req.user!.userId);
      res.json({ message: 'Данные успешно восстановлены из резервной копии' });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: 'Ошибка валидации',
          errors: error.errors,
        });
      }
      next(error);
    }
  };

  getSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await this.service.getBackupSettings();
      const status = await this.service.getAutoBackupStatus();
      
      res.json({
        settings,
        status: {
          enabled: status.enabled,
          scheduled: status.scheduled,
          nextRun: status.nextRun,
          lastRun: status.lastRun,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = backupSettingsSchema.parse(req.body);
      
      const settings = await this.service.updateBackupSettings({
        ...validated,
        lastAutoBackup: (await this.service.getBackupSettings()).lastAutoBackup,
        lastManualBackup: (await this.service.getBackupSettings()).lastManualBackup,
      });
      
      res.json(settings);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: 'Ошибка валидации',
          errors: error.errors,
        });
      }
      next(error);
    }
  };

  // runAutoBackupNow = async (req: Request, res: Response, next: NextFunction) => {
  //   try {
  //     await this.service.runAutoBackupNow();
  //     res.json({ message: 'Автобэкап запущен' });
  //   } catch (error) {
  //     next(error);
  //   }
  // };
}