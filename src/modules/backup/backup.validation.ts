import { z } from 'zod';

export const backupSettingsSchema = z.object({
  autoBackupEnabled: z.boolean(),
  frequency: z.enum(['daily', 'weekly', 'biweekly']),
  dayOfWeek: z.number().min(0).max(6),
  hour: z.number().min(0).max(23),
  minute: z.number().min(0).max(59),
  keepCount: z.number().min(1).max(50),
});

export const restoreBackupSchema = z.object({
  filename: z.string().min(1, 'Укажите имя файла'),
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'Необходимо подтвердить восстановление' }),
  }),
});

export type BackupSettingsInput = z.infer<typeof backupSettingsSchema>;
export type RestoreBackupInput = z.infer<typeof restoreBackupSchema>;