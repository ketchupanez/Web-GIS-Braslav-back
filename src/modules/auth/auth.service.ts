import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../shared/database';
import { LoginDto, RegisterDto, ChangePasswordDto, AuthResponse } from './auth.types';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const SALT_ROUNDS = 10;

export class AuthService {
  async login(data: LoginDto): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { login: data.login }
    });

    if (!user) {
      throw new Error('Неверный логин или пароль');
    }

    const isValidPassword = await bcrypt.compare(data.password, user.password);
    if (!isValidPassword) {
      throw new Error('Неверный логин или пароль');
    }

    const token = jwt.sign(
      { userId: user.id, login: user.login, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' } // Для простоты 24ч, потом можно сделать refresh tokens
    );

    return {
      user: {
        id: user.id,
        login: user.login,
        fullName: user.fullName,
        role: user.role.toLowerCase(),
        position: user.position
      },
      accessToken: token
    };
  }

  async register(data: RegisterDto): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { login: data.login }
    });

    if (existingUser) {
      throw new Error('Пользователь с таким логином уже существует');
    }

    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        login: data.login,
        password: hashedPassword,
        fullName: data.fullName,
        position: data.position,
        role: 'PENDING' // По умолчанию ожидает подтверждения
      }
    });

    const token = jwt.sign(
      { userId: user.id, login: user.login, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return {
      user: {
        id: user.id,
        login: user.login,
        fullName: user.fullName,
        role: user.role.toLowerCase(),
        position: user.position
      },
      accessToken: token
    };
  }

  async changePassword(userId: string, data: ChangePasswordDto): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    const isValidPassword = await bcrypt.compare(data.oldPassword, user.password);
    if (!isValidPassword) {
      throw new Error('Неверный старый пароль');
    }

    if (data.newPassword.length < 8) {
      throw new Error('Новый пароль должен быть минимум 8 символов');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });
  }

  async createSuperAdmin(login: string, password: string, fullName: string): Promise<void> {
    const existing = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' }
    });

    if (existing) {
      throw new Error('Супер-админ уже существует');
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    await prisma.user.create({
      data: {
        login,
        password: hashedPassword,
        fullName,
        role: 'SUPER_ADMIN'
      }
    });
  }
}