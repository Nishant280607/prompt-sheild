import type { Request, Response } from 'express';
import { getAuthUser } from '../middleware/auth.js';
import {
  changePassword,
  deleteAccount,
  getUserById,
  loginUser,
  registerUser,
  updateProfile,
} from '../services/auth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function register(req: Request, res: Response) {
  sendSuccess(res, await registerUser(req.body), 'Account created successfully.', 201);
}

export async function login(req: Request, res: Response) {
  sendSuccess(res, await loginUser(req.body), 'Signed in successfully.');
}

/** JWTs are stateless: the client discards its token. Changing the password revokes all tokens. */
export function logout(_req: Request, res: Response) {
  sendSuccess(res, null, 'Signed out.');
}

export async function me(req: Request, res: Response) {
  sendSuccess(res, await getUserById(getAuthUser(req).id));
}

export async function updateMe(req: Request, res: Response) {
  sendSuccess(res, await updateProfile(getAuthUser(req).id, req.body), 'Profile updated.');
}

export async function changeMyPassword(req: Request, res: Response) {
  sendSuccess(res, await changePassword(getAuthUser(req).id, req.body), 'Password changed. Other sessions have been signed out.');
}

export async function deleteMe(req: Request, res: Response) {
  await deleteAccount(getAuthUser(req).id, req.body.password);
  sendSuccess(res, null, 'Your account and all its data have been deleted.');
}
