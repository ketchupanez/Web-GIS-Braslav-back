import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { prisma } from './shared/database';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import { errorHandler } from './shared/middleware/errorHandler';
import auditRoutes from './modules/audit/audit.routes';
import geoRoutes from './modules/geo/geo.routes';
import { authenticate } from './shared/middleware/auth';
import tablesRoutes from './modules/tables/tables.routes';
import importRoutes from './modules/import/import.routes';
import chartsRoutes from './modules/charts/charts.routes';
import backupRoutes from './modules/backup/backup.routes';
import { AutoBackupService } from './modules/backup/auto-backup.service';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['http://localhost', 'http://localhost:80'] 
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/users', usersRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/import', importRoutes);
app.use('/api/charts', chartsRoutes);
app.use('/api/backups', backupRoutes);
app.get('/api/admin/stats', authenticate, async (req, res) => {
  try {
    const [
      lakes,
      springs,
      riverSegments,
      accommodation,
      touristStops,
      tourismOrganizers,
      users,
    ] = await Promise.all([
      prisma.lake.count(),
      prisma.spring.count(),
      prisma.riverSegment.count(),
      prisma.accommodation.count(),
      prisma.touristStop.count(),
      prisma.tourismOrganizer.count(),
      prisma.user.count(),
    ]);

    const uniqueRivers = await prisma.river.count();

    res.json({
      lakes,
      springs,
      rivers: uniqueRivers,
      riverSegments,
      accommodation,
      touristStops,
      tourismOrganizers,
      users,
      pendingUsers: await prisma.user.count({ where: { role: 'PENDING' } }),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);

  await AutoBackupService.init();
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});