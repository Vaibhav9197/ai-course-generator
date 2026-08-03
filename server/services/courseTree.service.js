import { Course, Module, Lesson } from '../models/index.js';

/**
 * Persists an outline as a Course > Module > Lesson tree.
 *
 * Shared by the seed script and the AI generation controller so there is exactly one
 * place that knows how the tree is wired together.
 *
 * Lessons are written as stubs (`content: []`, `isEnriched: false`); the enrich pass
 * fills them in on first view. See docs/ARCHITECTURE.md on two-stage generation.
 *
 * @param {object} params
 * @param {string} params.creator      Auth0 `sub` of the owner.
 * @param {object} params.outline      { title, description, tags[], modules[] }
 * @param {string} [params.topicPrompt] The raw prompt the user typed.
 */
export async function createCourseTree({ creator, outline, topicPrompt }) {
  const course = await Course.create({
    title: outline.title,
    description: outline.description,
    tags: outline.tags ?? [],
    creator,
    topicPrompt: topicPrompt ?? outline.title,
    status: 'ready',
    modules: [],
  });

  const moduleIds = [];

  for (const moduleOutline of outline.modules ?? []) {
    const mod = await Module.create({
      title: moduleOutline.title,
      summary: moduleOutline.summary,
      course: course._id,
      lessons: [],
    });

    // Lesson titles may arrive as plain strings or as objects, depending on how the
    // model chose to fill the schema. Accept both rather than failing generation.
    const lessonDocs = (moduleOutline.lessons ?? []).map((lesson) => ({
      title: typeof lesson === 'string' ? lesson : lesson.title,
      module: mod._id,
      content: [],
      isEnriched: false,
    }));

    if (lessonDocs.length) {
      const lessons = await Lesson.insertMany(lessonDocs);
      // insertMany preserves input order, which is the ordering the frontend routes by.
      mod.lessons = lessons.map((lesson) => lesson._id);
      await mod.save();
    }

    moduleIds.push(mod._id);
  }

  course.modules = moduleIds;
  await course.save();

  return course;
}

/**
 * Loads a course with its modules and lesson *titles* — deliberately without lesson
 * content, which can be tens of kilobytes per lesson and is never needed by the
 * overview page.
 */
export function loadCourseTree(courseId, creator) {
  return Course.findOne({ _id: courseId, creator }).populate({
    path: 'modules',
    populate: {
      path: 'lessons',
      select: 'title isEnriched enrichError objectives',
    },
  });
}

/**
 * Resolves the index-based route (/module/:moduleIndex/lesson/:lessonIndex) to a Lesson
 * document, verifying ownership along the way.
 *
 * Returns null when the course isn't the caller's or the indices are out of range — the
 * caller turns that into a 404 either way, so ownership failures are indistinguishable
 * from missing resources and course IDs cannot be enumerated.
 */
export async function resolveLessonByIndex({ courseId, creator, moduleIndex, lessonIndex }) {
  const course = await Course.findOne({ _id: courseId, creator }).populate({
    path: 'modules',
    select: 'title lessons',
  });
  if (!course) return null;

  const mod = course.modules?.[moduleIndex];
  if (!mod) return null;

  const lessonId = mod.lessons?.[lessonIndex];
  if (!lessonId) return null;

  const lesson = await Lesson.findById(lessonId);
  if (!lesson) return null;

  return { course, module: mod, lesson };
}

/** Deletes a course and everything beneath it. */
export async function deleteCourseTree(courseId, creator) {
  const course = await Course.findOne({ _id: courseId, creator });
  if (!course) return false;

  const modules = await Module.find({ course: course._id }).select('_id');
  const moduleIds = modules.map((mod) => mod._id);

  await Lesson.deleteMany({ module: { $in: moduleIds } });
  await Module.deleteMany({ _id: { $in: moduleIds } });
  await Course.deleteOne({ _id: course._id });

  return true;
}
