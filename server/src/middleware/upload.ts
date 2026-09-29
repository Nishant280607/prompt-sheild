import path from 'node:path';
import multer from 'multer';
import { UPLOAD_RULES } from '../config/constants.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * Prompt template upload: one file, kept in memory (never written to disk or executed),
 * size-limited and filtered by extension.
 */
export const uploadPromptFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 10 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!(UPLOAD_RULES.allowedExtensions as readonly string[]).includes(extension)) {
      callback(new AppError(415, 'UNSUPPORTED_FILE_TYPE', `Unsupported file type "${extension || 'none'}". Upload a .txt, .md or .json file.`));
      return;
    }
    callback(null, true);
  },
}).single(UPLOAD_RULES.fieldName);
