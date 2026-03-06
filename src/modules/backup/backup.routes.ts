import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { BackupController } from './backup.controller';

const router = Router();
const controller = new BackupController();

router.use(authenticate, requireRole('SUPER_ADMIN'));

router.get('/', controller.getAllBackups);
router.get('/manual', controller.getManualBackups);
router.get('/auto', controller.getAutoBackups);

router.post('/manual', controller.createManualBackup);

router.delete('/:filename', controller.deleteBackup);
router.get('/:filename/download', controller.downloadBackup);
router.get('/:filename/preview', controller.getBackupPreview);

router.post('/restore', controller.restoreBackup);

router.get('/settings', controller.getSettings);
router.patch('/settings', controller.updateSettings);
// router.post('/auto/run-now', controller.runAutoBackupNow);

export default router;