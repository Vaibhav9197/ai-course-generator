import { Course, Lesson, Module } from '../models/index.js';
import { generateCourseOutline } from '../services/gemini.service.js';
import {
  createCourseTree,
  loadCourseTree,
  buildLessonContext,
} from '../services/courseTree.service.js';
import { enrichLesson } from '../services/enrich.service.js';
import { currentUserSub } from '../middlewares/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { runOnce } from '../utils/inFlight.js';
import { COURSE_LIMITS } from '../../shared/contentBlocks.js';

const MAX_TOPIC_LENGTH = 300;

/**
 * POST /api/courses/generate
 * Body: { topic, moduleCount?, lessonsPerModule?, difficulty? }
 *
 * Stage 1 of generation: one Gemini call produces the outline, which is persisted
 * immediately with lessons as stubs. Bodies are written later, on first view.
 */
export const generateCourse = asyncHandler(async (req, res) => {
  const creator = currentUserSub(req);
  const { topic, moduleCount, lessonsPerModule, difficulty } = req.body ?? {};

  const cleanTopic = String(topic ?? '').trim();
  if (cleanTopic.length < 3) {
    throw ApiError.badRequest('Please describe a topic in at least 3 characters.');
  }
  if (cleanTopic.length > MAX_TOPIC_LENGTH) {
    throw ApiError.badRequest(`Please keep the topic under ${MAX_TOPIC_LENGTH} characters.`);
  }

  const options = {
    moduleCount: clampOptional(moduleCount, COURSE_LIMITS.MIN_MODULES, COURSE_LIMITS.MAX_MODULES),
    lessonsPerModule: clampOptional(
      lessonsPerModule,
      COURSE_LIMITS.MIN_LESSONS_PER_MODULE,
      COURSE_LIMITS.MAX_LESSONS_PER_MODULE,
    ),
    ...(difficulty ? { difficulty: String(difficulty).slice(0, 60) } : {}),
  };

  // Keyed on user + topic + shape, so a double-clicked button yields one course rather
  // than two, while genuinely different requests still run in parallel.
  const key = `generate:${creator}:${cleanTopic.toLowerCase()}:${options.moduleCount ?? ''}:${options.lessonsPerModule ?? ''}`;

  const course = await runOnce(key, async () => {
    const outline = await generateCourseOutline(cleanTopic, options);
    return createCourseTree({ creator, outline, topicPrompt: cleanTopic });
  });

  const tree = await loadCourseTree(course._id, creator);

  res.status(201).json({ course: tree });
});

/**
 * GET /api/courses/:courseId/module/:mi/lesson/:li  (generation-aware)
 *
 * Returns the lesson, generating its body first if this is the first view. Replaces the
 * read-only handler from phase 2 — see course.routes.js.
 */
export const getOrEnrichLesson = asyncHandler(async (req, res) => {
  const creator = currentUserSub(req);
  const moduleIndex = Number(req.params.moduleIndex);
  const lessonIndex = Number(req.params.lessonIndex);

  if (!Number.isInteger(moduleIndex) || !Number.isInteger(lessonIndex)) {
    throw ApiError.badRequest('Module and lesson indices must be integers.');
  }

  const course = await Course.findOne({ _id: req.params.courseId, creator }).populate({
    path: 'modules',
    select: 'title lessons',
  });
  if (!course) throw ApiError.notFound('Lesson not found.');

  const mod = course.modules?.[moduleIndex];
  if (!mod) throw ApiError.notFound('Lesson not found.');

  const lessonId = mod.lessons?.[lessonIndex];
  if (!lessonId) throw ApiError.notFound('Lesson not found.');

  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw ApiError.notFound('Lesson not found.');

  if (!lesson.isEnriched) {
    await enrichLesson({ lesson, course, module: mod });
  }

  res.json({
    lesson,
    context: buildLessonContext({ course, module: mod, moduleIndex, lessonIndex }),
  });
});

/**
 * POST /api/lessons/:lessonId/regenerate
 * Forces a fresh generation — used by the retry affordance after a failure, and when a
 * user wants a different take on a lesson.
 */
export const regenerateLesson = asyncHandler(async (req, res) => {
  const creator = currentUserSub(req);

  const lesson = await Lesson.findById(req.params.lessonId);
  if (!lesson) throw ApiError.notFound('Lesson not found.');

  const mod = await Module.findById(lesson.module);
  if (!mod) throw ApiError.notFound('Lesson not found.');

  // Ownership lives on the course, so it has to be checked from the lesson upwards.
  const course = await Course.findOne({ _id: mod.course, creator }).populate({
    path: 'modules',
    select: 'title lessons',
  });
  if (!course) throw ApiError.notFound('Lesson not found.');

  await enrichLesson({ lesson, course, module: mod, force: true });

  res.json({ lesson });
});

function clampOptional(value, min, max) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, Math.round(number)));
}
