import { COURSE_LIMITS, SUPPORTED_CODE_LANGUAGES } from '../../../shared/contentBlocks.js';

/**
 * Prompt for stage 2 of generation: one lesson's body.
 *
 * Called on first view of a lesson and cached forever after. Because it generates a
 * single lesson, the output stays a few thousand tokens — small enough to be reliable and
 * cheap enough that an abandoned course costs almost nothing.
 *
 * Surrounding lesson titles are included so the model can stay in its lane: without them
 * it re-teaches neighbouring lessons and the course becomes repetitive.
 */
export function generateLessonPrompt({
  courseTitle,
  moduleTitle,
  lessonTitle,
  siblingLessonTitles = [],
  moduleTitles = [],
}) {
  const siblings = siblingLessonTitles
    .filter((title) => title && title !== lessonTitle)
    .map((title) => `  - ${title}`)
    .join('\n');

  const modules = moduleTitles.map((title) => `  - ${title}`).join('\n');

  return `You are writing one lesson of an online course. Write it as an experienced practitioner explaining the idea to a capable beginner: direct, concrete, and honest about what is tricky.

COURSE: ${courseTitle}
MODULE: ${moduleTitle}
THIS LESSON: ${lessonTitle}

${modules ? `All modules in this course:\n${modules}\n` : ''}
${siblings ? `Other lessons in this same module — do NOT teach these, they are covered separately:\n${siblings}\n` : ''}
SCOPE
- Teach exactly what the lesson title names. If something belongs to a neighbouring lesson, refer to it in a clause and move on.
- Assume everything in earlier modules is already known. Do not re-explain it.

OBJECTIVES
- 3 or 4 objectives. Each must describe something the learner can observably do afterwards ("Identify…", "Write…", "Explain why…"), not something they will "understand" or "be aware of".

CONTENT BLOCKS
Build the lesson from an ordered array of blocks. Aim for 8 to 14 blocks before the questions.

  heading    { "type": "heading", "text": "...", "level": 2 }
             2 to 4 of these, dividing the lesson into sections. Use level 2, or 3 for a subsection.

  paragraph  { "type": "paragraph", "text": "..." }
             The substance of the lesson. Each paragraph should make one point in 2-5 sentences.
             You may use **bold** for emphasis and \`inline code\` for identifiers. No other
             markdown: no headings, lists, links or code fences inside a paragraph.

  code       { "type": "code", "language": "...", "text": "..." }
             Include ONLY if code genuinely clarifies this specific lesson. A lesson on a
             non-technical or conceptual topic should contain no code blocks at all.
             When you do include code: make it runnable and complete enough to be read on its
             own, keep it under 25 lines, and follow it with a paragraph explaining it.
             language must be one of: ${SUPPORTED_CODE_LANGUAGES.join(', ')}.

  video      { "type": "video", "query": "..." }
             Exactly one, placed near the end before the questions.
             The query is a YouTube SEARCH PHRASE — the words a person would type to find a
             good explanatory video on this lesson's subject. It must NEVER be a URL, a video
             ID, or a channel name. Do not invent links.

  mcq        { "type": "mcq", "question": "...", "options": [...], "answer": 0, "explanation": "..." }
             Exactly ${COURSE_LIMITS.MIN_MCQS_PER_LESSON} to ${COURSE_LIMITS.MAX_MCQS_PER_LESSON} of these, all at the very end, after every other block.
             - ${COURSE_LIMITS.MIN_MCQ_OPTIONS} or ${COURSE_LIMITS.MAX_MCQ_OPTIONS} options.
             - "answer" is the ZERO-BASED index of the correct option. It must be a valid
               index into that question's own options array.
             - Vary which position is correct across the questions.
             - Every wrong option must be plausible — a misconception someone might actually
               hold. No filler, no joke answers, and nothing that is obviously absurd.
             - Test whether the learner understood the reasoning, not whether they memorised
               a phrase from the text.
             - "explanation" says why the correct option is right, in one or two sentences.

ORDER
Prose and code first, then the single video block, then all the questions. Never put a
question before explanatory content.

STYLE
- No filler openings. Do not begin with "In this lesson we will…" or "Welcome".
- No summary or "conclusion" block at the end.
- Do not address the reader as "we". Use "you" or the imperative.
- Where a real-world detail matters (a version, a limit, a gotcha), say it specifically.

Return the lesson as JSON matching the provided schema. Return only the JSON object.`;
}

/**
 * Follow-up prompt used when a first response fails validation.
 *
 * Feeding the specific validation error back, along with the model's own output, is far
 * more effective than simply retrying the original prompt — a plain retry tends to
 * reproduce the same mistake.
 */
export function generateRepairPrompt({ originalPrompt, badOutput, validationError }) {
  return `Your previous response was rejected by a schema validator.

VALIDATION ERROR:
${validationError}

YOUR PREVIOUS RESPONSE:
${truncate(badOutput, 6000)}

Fix exactly what the error describes and return the corrected JSON. Keep everything that was already valid — do not rewrite the content or start over. Return only the JSON object, with no commentary and no markdown fences.

For reference, the original instructions were:
${truncate(originalPrompt, 2000)}`;
}

function truncate(text, limit) {
  const value = String(text ?? '');
  return value.length <= limit ? value : `${value.slice(0, limit)}\n…[truncated]`;
}

export default generateLessonPrompt;
