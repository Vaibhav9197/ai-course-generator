import { Course } from '../models/index.js';
import {
  loadCourseTree,
  resolveLessonByIndex,
  deleteCourseTree,
} from '../services/courseTree.service.js';
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

/**
 * GET /api/courses/:courseId/module/:moduleIndex/lesson/:lessonIndex
 *
 * Returns the lesson plus the breadcrumb context and prev/next targets the viewer needs,
 * so the lesson page renders from a single request.
 *
 * Enrichment on demand is layered on top of this in phase 3; for now an un-enriched
 * lesson is returned as-is and the UI shows its pending state.
 */
export const getLessonByIndex = asyncHandler(async (req, res) => {
  const creator = currentUserSub(req);
  const moduleIndex = Number(req.params.moduleIndex);
  const lessonIndex = Number(req.params.lessonIndex);

  if (!Number.isInteger(moduleIndex) || !Number.isInteger(lessonIndex)) {
    throw ApiError.badRequest('Module and lesson indices must be integers.');
  }

  const resolved = await resolveLessonByIndex({
    courseId: req.params.courseId,
    creator,
    moduleIndex,
    lessonIndex,
  });
  if (!resolved) throw ApiError.notFound('Lesson not found.');

  const { course, module: mod, lesson } = resolved;

  res.json({
    lesson,
    context: buildLessonContext({ course, mod, moduleIndex, lessonIndex }),
  });
});

/**
 * Builds breadcrumb + prev/next navigation. Lesson-to-lesson movement crosses module
 * boundaries, so this walks the flattened lesson sequence rather than just the current
 * module's array.
 */
function buildLessonContext({ course, mod, moduleIndex, lessonIndex }) {
  const flat = [];
  course.modules.forEach((m, mi) => {
    (m.lessons ?? []).forEach((_, li) => flat.push({ moduleIndex: mi, lessonIndex: li }));
  });

  const position = flat.findIndex(
    (entry) => entry.moduleIndex === moduleIndex && entry.lessonIndex === lessonIndex,
  );

  return {
    courseId: course._id,
    courseTitle: course.title,
    moduleTitle: mod.title,
    moduleIndex,
    lessonIndex,
    position: position + 1,
    total: flat.length,
    prev: position > 0 ? flat[position - 1] : null,
    next: position >= 0 && position < flat.length - 1 ? flat[position + 1] : null,
  };
}
