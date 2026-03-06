import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { prisma } from '../../shared/database';

const router = Router();

router.get('/logs', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: { fullName: true, login: true }
      }
    }
  });
  
  res.json(logs.map(log => ({
    id: log.id,
    user: log.user,
    action: log.action,
    tableRef: log.tableRef,
    tableName: log.tableName,
    recordId: log.recordId,
    recordName: log.recordName,
    description: log.description,
    createdAt: log.createdAt,
  })));
});

export default router;