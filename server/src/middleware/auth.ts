import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { JWT_AUDIENCE, JWT_ISSUER } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

/** Verify the Bearer JWT and attach the user to the request. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw AppError.unauthorized('UNAUTHORIZED', 'Please sign in to continue.');

  let payload: JwtPayload;
  try {
    const decoded = jwt.verify(header.slice(7).trim(), env.jwtSecret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (typeof decoded === 'string') throw new Error('Unexpected token payload');
    payload = decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('TOKEN_EXPIRED', 'Your session has expired. Please sign in again.');
    }
    throw AppError.unauthorized('INVALID_TOKEN', 'Your session is invalid. Please sign in again.');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub ?? '' },
    select: { id: true, name: true, email: true, tokenVersion: true },
  });
  if (!user || user.tokenVersion !== payload.tv) {
    throw AppError.unauthorized('SESSION_REVOKED', 'Your session is no longer valid. Please sign in again.');
  }
  req.user = { id: user.id, name: user.name, email: user.email };
  next();
}

export function getAuthUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
