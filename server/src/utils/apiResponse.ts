import type { Response } from 'express';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Send a response in the standard `{ success, data, message }` envelope. */
export function sendSuccess<T>(res: Response, data: T, message?: string, status = 200): Response {
  const body: ApiSuccess<T> = { success: true, data };
  if (message) body.message = message;
  return res.status(status).json(body);
}

/** Send an error in the standard `{ success: false, error }` envelope. */
export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: ApiErrorBody = { success: false, error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}
