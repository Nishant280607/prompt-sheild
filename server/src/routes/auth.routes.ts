import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import {
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/auth.schemas.js';

const router = Router();

router.post('/register', authLimiter, validateBody(registerSchema), auth.register);
router.post('/login', authLimiter, validateBody(loginSchema), auth.login);
router.post('/logout', auth.logout);
router.get('/me', requireAuth, auth.me);
router.put('/me', requireAuth, validateBody(updateProfileSchema), auth.updateMe);
router.put('/password', requireAuth, validateBody(changePasswordSchema), auth.changeMyPassword);
router.delete('/me', requireAuth, validateBody(deleteAccountSchema), auth.deleteMe);

export default router;
