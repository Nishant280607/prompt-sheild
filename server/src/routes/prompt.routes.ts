import { Router } from 'express';
import * as prompts from '../controllers/prompt.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { analysisLimiter } from '../middleware/rateLimit.js';
import { uploadPromptFile } from '../middleware/upload.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  analyzeSchema,
  compareQuery,
  createPromptSchema,
  createVersionSchema,
  listPromptsQuery,
  updatePromptSchema,
  validateContentSchema,
} from '../validators/prompt.schemas.js';

const router = Router();
router.use(requireAuth);

router.get('/', validateQuery(listPromptsQuery), prompts.list);
router.post('/', validateBody(createPromptSchema), prompts.create);
router.post('/validate', validateBody(validateContentSchema), prompts.validateContent);
router.post('/upload', uploadPromptFile, prompts.upload);

router.get('/:id', prompts.get);
router.put('/:id', validateBody(updatePromptSchema), prompts.update);
router.delete('/:id', prompts.remove);
router.post('/:id/validate', prompts.validateStored);
router.post('/:id/analyze', analysisLimiter, validateBody(analyzeSchema), prompts.analyze);
router.get('/:id/versions', prompts.versions);
router.post('/:id/versions', validateBody(createVersionSchema), prompts.createNewVersion);
router.get('/:id/versions/:versionNumber', prompts.getOneVersion);
router.get('/:id/compare', validateQuery(compareQuery), prompts.compare);

export default router;
