import { z } from 'zod';

const loginSchemaBase = z.string()
  .min(5, 'Логин должен содержать минимум 5 символов')
  .max(20, 'Логин не должен превышать 20 символов')
  .regex(/^[a-zA-Z0-9._]+$/, 'Логин может содержать только латинские буквы, цифры, точки и подчеркивания')
  .regex(/[a-zA-Z]/, 'Логин должен содержать хотя бы одну букву');

const passwordSchemaBase = z.string()
  .min(8, 'Пароль должен содержать минимум 8 символов')
  .max(20, 'Пароль слишком длинный')
  .regex(/[A-Z]/, 'Пароль должен содержать хотя бы одну заглавную букву')
  .regex(/[a-z]/, 'Пароль должен содержать хотя бы одну строчную букву')
  .regex(/[0-9]/, 'Пароль должен содержать хотя бы одну цифру');

export const loginSchema = z.object({
  login: loginSchemaBase,
  password: z.string().min(1, 'Введите пароль')
});

export const registerSchema = z.object({
  login: loginSchemaBase,
  password: passwordSchemaBase,
  fullName: z.string()
    .min(3, 'ФИО должно содержать минимум 3 символа')
    .max(50, 'ФИО слишком длинное')
    .regex(/^[а-яА-ЯёЁa-zA-Z\s-]+$/, 'ФИО может содержать только буквы и дефисы'),
  position: z.string()
    .max(50, 'Название должности слишком длинное')
    .optional()
    .or(z.literal(''))
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Введите текущий пароль'),
  newPassword: passwordSchemaBase
}).refine((data) => data.oldPassword !== data.newPassword, {
  message: 'Новый пароль должен отличаться от старого',
  path: ['newPassword']
});