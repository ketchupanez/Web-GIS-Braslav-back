import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authenticate } from '../../shared/middleware/auth';
import { prisma } from '../../shared/database';

const router = Router();
const controller = new AuthController();

router.post('/login', controller.login.bind(controller));
router.post('/register', controller.register.bind(controller));
router.post('/change-password', authenticate, controller.changePassword.bind(controller));
router.get('/me', authenticate, controller.getMe.bind(controller));
router.get('/check-login', async (req, res) => {
    const { login } = req.query;
    
    if (!login || typeof login !== 'string') {
      return res.status(400).json({ message: 'Укажите логин' });
    }
    
    if (login.length < 5) {
      return res.json({ 
        exists: false, 
        valid: false, 
        message: 'Логин должен быть от 5 символов' 
      });
    }
    
    if (!/^[a-zA-Z0-9._]+$/.test(login)) {
      return res.json({ 
        exists: false, 
        valid: false, 
        message: 'Только латинские буквы, цифры, точки и подчеркивания' 
      });
    }
    
    const exists = await prisma.user.findFirst({ 
      where: { 
        login: { equals: login, mode: 'insensitive' } 
      } 
    });
    
    res.json({ 
      exists: !!exists, 
      valid: true,
      message: exists ? 'Этот логин уже занят' : 'Логин свободен'
    });
  });
export default router;