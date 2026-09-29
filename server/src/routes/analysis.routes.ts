import { Router } from 'express';
import * as analyses from '../controllers/analysis.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { listAnalysesQuery } from '../validators/prompt.schemas.js';

const router = Router();
router.use(requireAuth);

router.get('/', validateQuery(listAnalysesQuery), analyses.list);
router.get('/:id', analyses.get);
router.get('/:id/status', analyses.status);
router.get('/:id/report', analyses.report);
router.get('/:id/pdf', analyses.pdf);
router.delete('/:id', analyses.remove);

export default router;
