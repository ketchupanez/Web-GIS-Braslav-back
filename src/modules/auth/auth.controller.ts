import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { loginSchema, registerSchema, changePasswordSchema } from './auth.validation';
import { prisma } from '../../shared/database';

const authService = new AuthService();

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const data = loginSchema.parse(req.body);
      const result = await authService.login(data);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data = registerSchema.parse(req.body);
      const result = await authService.register(data);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Не авторизован' });
      }

      const data = changePasswordSchema.parse(req.body);
      await authService.changePassword(userId, data);
      res.json({ message: 'Пароль успешно изменен' });
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response) {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Не авторизован' });
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, login: true, fullName: true, role: true, position: true }
    });
    
    if (!user) return res.status(404).json({ message: 'Не найден' });
    
    res.json({ user: { ...user, role: user.role.toLowerCase() } });
  }
}