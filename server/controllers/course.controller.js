import { Course } from '../models/index.js';
import { loadCourseTree, deleteCourseTree } from '../services/courseTree.service.js';
import { currentUserSub } from '../middlewares/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

/**
 * GET /api/courses
 * The signed-in user's courses, newest first. Titles and counts only.
 */
export const listCourses = asyncHandler(async (req, res) => {
  const creator = currentUserSub(req);

  const courses = await Course.find({ creator })
    .sort({ createdAt: -1 })
    .select('title description tags status createdAt modules')
    .populate({ path: 'modules', select: 'lessons' });

  res.json({
    courses: courses.map((course) => ({
      id: course._id,
      title: course.title,
      description: course.description,
      tags: course.tags,
      status: course.status,
      createdAt: course.createdAt,
      moduleCount: course.modules.length,
      lessonCount: course.modules.reduce((n, mod) => n + (mod.lessons?.length ?? 0), 0),
    })),
  });
});

/**
 * GET /api/courses/:courseId
 * The full tree with lesson titles but not lesson content.
 */
export const getCourse = asyncHandler(async (req, res) => {
  const creator = currentUserSub(req);

  const course = await loadCourseTree(req.params.courseId, creator);
  if (!course) throw ApiError.notFound('Course not found.');

  res.json({ course });
});

/**
 * DELETE /api/courses/:courseId
 */
export const deleteCourse = asyncHandler(async (req, res) => {
  const creator = currentUserSub(req);

  const deleted = await deleteCourseTree(req.params.courseId, creator);
  if (!deleted) throw ApiError.notFound('Course not found.');

  res.status(204).end();
});

// The lesson-by-index handler lives in generate.controller.js as getOrEnrichLesson,
// because reading a lesson for the first time is what triggers its generation.
