import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/** Validate and normalise req.body with a Zod schema (errors become 400 VALIDATION_ERROR). */
export const validateBody =
  (schema: ZodType) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body ?? {});
    next();
  };

/** Express 5 exposes req.query as read-only, so parsed query values are stored in res.locals.query. */
export const validateQuery =
  (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction): void => {
    res.locals.query = schema.parse(req.query);
    next();
  };
