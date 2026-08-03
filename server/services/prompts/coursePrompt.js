import { COURSE_LIMITS } from '../../../shared/contentBlocks.js';

/**
 * Prompt for stage 1 of generation: the course outline.
 *
 * This pass produces titles only — no lesson bodies. Keeping the output small is what
 * makes the request finish in seconds instead of minutes and keeps it well clear of any
 * output-token ceiling where JSON gets truncated mid-structure.
 */
export function generateCoursePrompt(topic, options = {}) {
  const {
    moduleCount,
    lessonsPerModule,
    difficulty = 'beginner-to-intermediate',
  } = options;

  const moduleInstruction = moduleCount
    ? `Produce exactly ${moduleCount} modules.`
    : `Produce between ${COURSE_LIMITS.MIN_MODULES} and ${COURSE_LIMITS.MAX_MODULES} modules — as many as the topic genuinely needs, no padding.`;

  const lessonInstruction = lessonsPerModule
    ? `Give every module exactly ${lessonsPerModule} lessons.`
    : `Give every module between ${COURSE_LIMITS.MIN_LESSONS_PER_MODULE} and ${COURSE_LIMITS.MAX_LESSONS_PER_MODULE} lessons.`;

  return `You are an experienced curriculum designer. Design the outline for a self-paced online course on the following topic.

TOPIC: ${topic}

AUDIENCE: ${difficulty} learners who are new to this specific topic but are comfortable learning independently.

STRUCTURE
- ${moduleInstruction}
- ${lessonInstruction}
- Order modules so each one only depends on what earlier modules already taught. Module 1 must assume no prior knowledge of the topic.
- Within a module, order lessons the same way.

LESSON TITLES
- Each lesson title must name one teachable idea, specific enough that you could write 600 words on it and nothing else.
- Prefer concrete titles over vague ones: "Handling Form Validation Errors" rather than "More About Forms".
- No lesson may duplicate or substantially overlap another, in any module.
- Do not number the titles; ordering is already implied by position.

COVERAGE
- Between them, the lessons must cover what someone actually needs to use this topic in practice — not just definitions. Include the common pitfalls and the "how do I really do this" material that tutorials usually skip.
- If the topic has widely used tools, standards or terminology, the outline must reach them.

TITLE AND DESCRIPTION
- The course title should describe the subject plainly. Do not use words like "mastering", "ultimate", "complete guide" or "unleash".
- The description is two or three sentences: what the course covers, and what a learner will be able to do afterwards.

TAGS
- 3 to 6 lowercase tags. Single words or hyphenated. Real topic keywords, not marketing terms.

Return the outline as JSON matching the provided schema. Return only the JSON object.`;
}

export default generateCoursePrompt;
