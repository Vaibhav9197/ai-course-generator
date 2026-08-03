import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { generationLimiter, enrichmentLimiter } from '../middlewares/rateLimit.js';
import { listCourses, getCourse, deleteCourse } from '../controllers/course.controller.js';
import { generateCourse, getOrEnrichLesson } from '../controllers/generate.controller.js';

const router = Router();

// Every course route is owner-scoped; requireAuth supplies the identity that scoping
// depends on, so it is applied to the whole router rather than per-route.
router.use(requireAuth);

// Declared before '/:courseId' so "generate" is not captured as a course id.
router.post('/generate', generationLimiter, generateCourse);

router.get('/', listCourses);
router.get('/:courseId', getCourse);
router.delete('/:courseId', deleteCourse);

// Reading a lesson for the first time is what triggers its generation, so this route is
// rate-limited too.
router.get(
  '/:courseId/module/:moduleIndex/lesson/:lessonIndex',
  enrichmentLimiter,
  getOrEnrichLesson,
);

export default router;
