import { Router } from 'express';
import healthRoutes from './health.routes.js';
import courseRoutes from './course.routes.js';

const router = Router();

router.use(healthRoutes);
router.use('/courses', courseRoutes);

// Feature routers mounted as later phases land:
//   router.use('/lessons', lessonRoutes);
//   router.use('/youtube', youtubeRoutes);
//   router.use('/me', userRoutes);

export default router;
