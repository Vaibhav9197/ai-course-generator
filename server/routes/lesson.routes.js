import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { enrichmentLimiter, narrationLimiter } from '../middlewares/rateLimit.js';
import { regenerateLesson } from '../controllers/generate.controller.js';
import { translateLesson, narrateLesson } from '../controllers/narration.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/:lessonId/regenerate', enrichmentLimiter, regenerateLesson);

router.post('/:lessonId/translate', narrationLimiter, translateLesson);
router.post('/:lessonId/audio', narrationLimiter, narrateLesson);

export default router;
