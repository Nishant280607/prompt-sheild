import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { sendError } from '../utils/apiResponse.js';
import { isUniqueConstraintError } from '../utils/dbErrors.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} was not found.`);
};

/** Converts every error into the standard error envelope. Stack traces are never sent to clients. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.message, err.details);
    return;
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
    sendError(res, 400, 'VALIDATION_ERROR', details[0]?.message ?? 'The request is invalid.', details);
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      sendError(res, 413, 'FILE_TOO_LARGE', `The file is larger than the ${Math.round(env.MAX_UPLOAD_BYTES / 1024)} KB limit.`);
    } else {
      sendError(res, 400, 'INVALID_UPLOAD', 'The upload could not be processed. Send one file in the "file" field.');
    }
    return;
  }

  const known = err as { type?: string; code?: string };
  if (known.type === 'entity.too.large') {
    sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    return;
  }
  if (known.type === 'entity.parse.failed') {
    sendError(res, 400, 'INVALID_JSON', 'The request body is not valid JSON.');
    return;
  }
  if (isUniqueConstraintError(err)) {
    sendError(res, 409, 'CONFLICT', 'This record already exists.');
    return;
  }
  if (known.code === 'P2025') {
    sendError(res, 404, 'NOT_FOUND', 'The requested record was not found.');
    return;
  }

  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
};
