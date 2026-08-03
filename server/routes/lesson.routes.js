import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { enrichmentLimiter } from '../middlewares/rateLimit.js';
import { regenerateLesson } from '../controllers/generate.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/:lessonId/regenerate', enrichmentLimiter, regenerateLesson);

export default router;
