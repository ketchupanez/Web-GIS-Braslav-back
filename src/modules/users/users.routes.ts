import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { prisma } from '../../shared/database';

const router = Router();

const validRoles = ['PENDING', 'ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'];

// Получить всех пользователей (только main_admin и выше)
router.get('/', authenticate, requireRole('MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      fullName: true,
      login: true,
      role: true,
      position: true,
      contactInfo: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });
  
  res.json(users.map(u => ({ ...u, role: u.role.toLowerCase() })));
});

// Получить свой профиль
router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      fullName: true,
      login: true,
      role: true,
      position: true,
      contactInfo: true,
      createdAt: true
    }
  });
  res.json({ ...user, role: user?.role.toLowerCase() });
});

// Обновить свой профиль
router.patch('/me', authenticate, async (req, res) => {
  const { position, contactInfo } = req.body;
  
  // Валидация входных данных
  if (position !== undefined && (typeof position !== 'string' || position.length > 100)) {
    return res.status(400).json({ message: 'Некорректная должность' });
  }
  
  if (contactInfo !== undefined && (typeof contactInfo !== 'string' || contactInfo.length > 200)) {
    return res.status(400).json({ message: 'Контактная информация слишком длинная' });
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.userId },
    data: { 
      position: position || null, 
      contactInfo: contactInfo || null 
    }
  });
  
  res.json({ ...updated, role: updated.role.toLowerCase() });
});

// Изменить роль пользователя
router.patch('/:id/role', authenticate, requireRole('MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  
  // Валидация роли
  if (!role || !validRoles.includes(role.toUpperCase())) {
    return res.status(400).json({ message: 'Неверная роль' });
  }
  
  const targetRole = role.toUpperCase();
  
  // Нельзя менять роль суперадмина (кроме самого себя, но себя тоже нельзя понизить)
  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  
  if (targetUser.role === 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Нельзя изменить роль суперадмина' });
  }
  
  // Main_admin не может назначать super_admin
  if (targetRole === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Только суперадмин может назначать суперадминов' });
  }
  
  // Admin не может назначать main_admin или super_admin
  if (req.user?.role === 'ADMIN' && (targetRole === 'MAIN_ADMIN' || targetRole === 'SUPER_ADMIN')) {
    return res.status(403).json({ message: 'Недостаточно прав для назначения этой роли' });
  }
  
  const updated = await prisma.user.update({
    where: { id },
    data: { role: targetRole }
  });
  
  res.json({ ...updated, role: updated.role.toLowerCase() });
});

// Удалить пользователя
router.delete('/:id', authenticate, requireRole('MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const { id } = req.params;
  
  // Нельзя удалить самого себя
  if (id === req.user?.userId) {
    return res.status(403).json({ message: 'Нельзя удалить самого себя' });
  }
  
  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  
  // Нельзя удалить суперадмина
  if (targetUser.role === 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Нельзя удалить суперадмина' });
  }
  
  // Main_admin не может удалить другого main_admin
  if (targetUser.role === 'MAIN_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Только суперадмин может удалить главного администратора' });
  }
  
  await prisma.user.delete({ where: { id } });
  res.json({ message: 'Пользователь удален' });
});

router.get('/stats', authenticate, requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const [lakes, springs, rivers, acc, stops, orgs, users, pending] = await Promise.all([
    prisma.lake.count(),
    prisma.spring.count(),
    prisma.river.count(), // уникальные реки
    prisma.accommodation.count(),
    prisma.touristStop.count(),
    prisma.tourismOrganizer.count(),
    prisma.user.count(),
    prisma.user.count({ where: { role: 'PENDING' } }),
  ]);

  res.json({
    lakes, springs, rivers,
    accommodation: acc,
    touristStops: stops,
    tourismOrganizers: orgs,
    users, pendingUsers: pending,
  });
});

export default router;