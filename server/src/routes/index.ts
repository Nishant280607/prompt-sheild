import { Router } from 'express';
import * as system from '../controllers/system.controller.js';
import { requireAuth } from '../middleware/auth.js';
import analysisRoutes from './analysis.routes.js';
import authRoutes from './auth.routes.js';
import promptRoutes from './prompt.routes.js';

/** All REST endpoints, mounted under /api by app.ts. */
const router = Router();

router.get('/health', system.health);
router.get('/system/status', system.systemStatus);
router.get('/samples', system.samples);

router.use('/auth', authRoutes);
router.use('/prompts', promptRoutes);
router.use('/analyses', analysisRoutes);
router.get('/dashboard/summary', requireAuth, system.dashboardSummary);
router.get('/recommendations', requireAuth, system.recommendations);

export default router;
