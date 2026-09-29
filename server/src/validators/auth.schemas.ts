import { z } from 'zod';
import { stripControlChars } from '../utils/text.js';

const email = z.string().trim().toLowerCase().max(254).email('Enter a valid email address.');

export const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
  .regex(/\d/, 'Password must contain at least one number.');

const name = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(80, 'Name must be at most 80 characters.')
  .transform(stripControlChars);

export const registerSchema = z.object({ name, email, password: passwordRule });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required.').max(128),
});

export const updateProfileSchema = z.object({ name });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, 'Current password is required.'), newPassword: passwordRule })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'The new password must be different from the current one.',
    path: ['newPassword'],
  });

export const deleteAccountSchema = z.object({ password: z.string().min(1, 'Password is required.') });
