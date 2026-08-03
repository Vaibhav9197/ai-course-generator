import { Router } from 'express';
import healthRoutes from './health.routes.js';

const router = Router();

router.use(healthRoutes);

// Feature routers are mounted here as later phases land:
//   router.use('/courses', courseRoutes);
//   router.use('/lessons', lessonRoutes);
//   router.use('/youtube', youtubeRoutes);
//   router.use('/me', userRoutes);

export default router;
