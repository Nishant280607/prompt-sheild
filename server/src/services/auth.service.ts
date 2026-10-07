import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { getJwtSecret } from './secret.service.js';

export const JWT_ISSUER = 'prompt-shield';
export const JWT_AUDIENCE = 'prompt-shield-client';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
  expiresAt: string;
}

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('prompt-shield-dummy-password', 4);

export const toPublicUser = (user: { id: string; name: string; email: string; createdAt: Date }): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  createdAt: user.createdAt.toISOString(),
});

export function signToken(user: { id: string; tokenVersion: number }): { token: string; expiresAt: string } {
  const token = jwt.sign({ tv: user.tokenVersion }, getJwtSecret(), {
    subject: user.id,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
  const decoded = jwt.decode(token) as JwtPayload;
  return { token, expiresAt: new Date((decoded.exp ?? 0) * 1000).toISOString() };
}

export async function registerUser(input: { name: string; email: string; password: string }): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict('EMAIL_IN_USE', 'An account with this email already exists.');
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const user = await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash } });
  return { user: toPublicUser(user), ...signToken(user) };
}

export async function loginUser(input: { email: string; password: string }): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw AppError.unauthorized('INVALID_CREDENTIALS', 'Invalid email or password.');
  return { user: toPublicUser(user), ...signToken(user) };
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw AppError.notFound('USER_NOT_FOUND', 'User not found.');
  return toPublicUser(user);
}

export async function updateProfile(id: string, input: { name: string }): Promise<PublicUser> {
  const user = await prisma.user.update({ where: { id }, data: { name: input.name } });
  return toPublicUser(user);
}

/** Changing the password increments tokenVersion, which signs out every other session. */
export async function changePassword(
  id: string,
  input: { currentPassword: string; newPassword: string },
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw AppError.badRequest('INVALID_PASSWORD', 'The current password is incorrect.');
  }
  const updated = await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(input.newPassword, env.BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
  });
  return { user: toPublicUser(updated), ...signToken(updated) };
}

export async function deleteAccount(id: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw AppError.badRequest('INVALID_PASSWORD', 'The password is incorrect.');
  }
  await prisma.user.delete({ where: { id } });
}
