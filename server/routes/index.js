import { Router } from 'express';
import healthRoutes from './health.routes.js';
import courseRoutes from './course.routes.js';
import lessonRoutes from './lesson.routes.js';
import userRoutes from './user.routes.js';
import youtubeRoutes from './youtube.routes.js';

const router = Router();

router.use(healthRoutes);
router.use('/courses', courseRoutes);
router.use('/lessons', lessonRoutes);
router.use('/me', userRoutes);
router.use('/youtube', youtubeRoutes);

export default router;
