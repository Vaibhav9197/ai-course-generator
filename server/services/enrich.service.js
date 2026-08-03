import { Module } from '../models/index.js';
import { generateLessonContent } from './gemini.service.js';
import { runOnce } from '../utils/inFlight.js';

/**
 * Enriches a lesson: generates its body on first view and persists the result.
 *
 * Idempotent by design. Once `isEnriched` is set the lesson is never regenerated, so each
 * lesson costs exactly one Gemini call for its entire lifetime, and concurrent requests
 * for the same lesson share a single call via runOnce.
 *
 * @param {object} params
 * @param {object} params.lesson  Lesson document (mutated and saved on success).
 * @param {object} params.course  Course document, for prompt context.
 * @param {object} params.module  Module document the lesson belongs to.
 * @param {boolean} [params.force] Regenerate even if already enriched.
 */
export async function enrichLesson({ lesson, course, module: mod, force = false }) {
  if (lesson.isEnriched && !force) return lesson;

  return runOnce(`enrich:${lesson._id}`, async () => {
    // Another request may have finished while we waited for the lock.
    if (lesson.isEnriched && !force) return lesson;

    const context = await buildPromptContext({ lesson, course, mod });

    try {
      const generated = await generateLessonContent(context);
      await lesson.applyEnrichment(generated);
      return lesson;
    } catch (err) {
      // Record the failure on the lesson so the UI can explain it and offer a retry,
      // then rethrow so this request still reports the error.
      lesson.enrichError = err.message;
      await lesson.save().catch(() => {});
      throw err;
    }
  });
}

/**
 * Assembles the surrounding titles the lesson prompt needs.
 *
 * Sibling lesson titles matter more than they look: without them the model re-teaches
 * neighbouring lessons and the course reads as repetitive.
 */
async function buildPromptContext({ lesson, course, mod }) {
  // `mod` may arrive as a lean/populated subdocument, so re-read the lesson titles.
  const fullModule = await Module.findById(mod._id).populate({
    path: 'lessons',
    select: 'title',
  });

  const siblingLessonTitles = (fullModule?.lessons ?? []).map((item) => item.title);

  const moduleTitles = Array.isArray(course.modules)
    ? course.modules.map((item) => (typeof item === 'object' && item?.title ? item.title : null)).filter(Boolean)
    : [];

  return {
    courseTitle: course.title,
    moduleTitle: mod.title,
    lessonTitle: lesson.title,
    siblingLessonTitles,
    moduleTitles,
  };
}
