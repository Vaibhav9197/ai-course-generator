import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listCourses,
  getCourse,
  deleteCourse,
  getLessonByIndex,
} from '../controllers/course.controller.js';

const router = Router();

// Every course route is owner-scoped; requireAuth supplies the identity that scoping
// depends on, so it is applied to the whole router rather than per-route.
router.use(requireAuth);

router.get('/', listCourses);
router.get('/:courseId', getCourse);
router.delete('/:courseId', deleteCourse);
router.get('/:courseId/module/:moduleIndex/lesson/:lessonIndex', getLessonByIndex);

export default router;
