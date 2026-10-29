/**
 * The content-block contract.
 *
 * This single definition is the spine of the app. It is used as:
 *   - the shape Gemini is instructed to emit (server/services/prompts)
 *   - the Gemini `responseSchema` (server/services/geminiSchemas.js)
 *   - the runtime validator (server/services/aiJson.service.js)
 *   - the shape persisted in `Lesson.content` (server/models/Lesson.js)
 *   - the key into the React block registry (client/src/components/blocks/index.js)
 *
 * Keep this file dependency-free so both the Node server and the Vite client can
 * import it without a build step.
 */

export const BLOCK_TYPES = Object.freeze({
  HEADING: 'heading',
  PARAGRAPH: 'paragraph',
  CODE: 'code',
  VIDEO: 'video',
  MCQ: 'mcq',
});

export const ALL_BLOCK_TYPES = Object.freeze(Object.values(BLOCK_TYPES));

/**
 * Block shapes:
 *
 *   { type: 'heading',   text: string, level?: 2 | 3 }
 *   { type: 'paragraph', text: string }              // inline markdown: **bold**, `code`
 *   { type: 'code',      language: string, text: string }
 *   { type: 'video',     query: string }             // a SEARCH QUERY, never a URL
 *   { type: 'mcq',       question: string, options: string[], answer: number,
 *                        explanation: string }
 *
 * Two rules that prevent whole classes of bugs:
 *
 *  1. Video blocks carry a search *query*, not a URL. Model-invented YouTube URLs are
 *     almost always dead links, so resolution happens server-side at render time
 *     against the YouTube Data API (see server/services/youtube.service.js).
 *
 *  2. Consumers must treat an unrecognised `type` as a no-op rather than an error.
 *     The client registry returns null for unknown types, so new block types can ship
 *     backend-first without breaking already-deployed clients.
 */

/** Course-shape limits from the hackathon brief (3-6 modules, 3-5 lessons each). */
export const COURSE_LIMITS = Object.freeze({
  MIN_MODULES: 3,
  MAX_MODULES: 6,
  MIN_LESSONS_PER_MODULE: 3,
  MAX_LESSONS_PER_MODULE: 5,
  MIN_MCQ_OPTIONS: 3,
  MAX_MCQ_OPTIONS: 4,
  MIN_MCQS_PER_LESSON: 4,
  MAX_MCQS_PER_LESSON: 5,
  MIN_RESOURCES: 2,
  MAX_RESOURCES: 4,
});

/**
 * Further-reading resources, stored on the lesson next to `objectives`:
 *
 *   { title: string, kind: ResourceKind, query: string }
 *
 * They follow the same rule as video blocks: the model names a real source and gives the
 * *search phrase* that finds it, never a URL, because model-invented links are mostly
 * dead. The UI turns the query into a web-search link (see resourceSearchUrl).
 *
 * Kept off the block array on purpose: resources are a list *about* the lesson rather than
 * part of its teaching flow, so they don't belong in narration, quiz numbering or the
 * block registry.
 */
export const RESOURCE_KINDS = Object.freeze(['documentation', 'article', 'book', 'course', 'tool']);

/** Kind used when the model returns one outside RESOURCE_KINDS. */
export const DEFAULT_RESOURCE_KIND = 'article';

export function resourceSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(String(query ?? ''))}`;
}

export const SUPPORTED_CODE_LANGUAGES = Object.freeze([
  'javascript', 'typescript', 'jsx', 'python', 'java', 'go', 'rust', 'c', 'cpp',
  'csharp', 'php', 'ruby', 'swift', 'kotlin', 'sql', 'bash', 'json', 'yaml',
  'html', 'css', 'text',
]);

export function isBlockType(value) {
  return typeof value === 'string' && ALL_BLOCK_TYPES.includes(value);
}

/** Plain-text projection of a lesson's blocks — used as the input to translation/TTS. */
export function blocksToPlainText(content = []) {
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    switch (block.type) {
      case BLOCK_TYPES.HEADING:
        parts.push(`\n${block.text}\n`);
        break;
      case BLOCK_TYPES.PARAGRAPH:
        // Strip the inline markdown we support so it isn't read aloud verbatim.
        parts.push(String(block.text || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1'));
        break;
      case BLOCK_TYPES.CODE:
        parts.push(`(code example in ${block.language || 'code'})`);
        break;
      case BLOCK_TYPES.MCQ:
        parts.push(`Question: ${block.question}`);
        break;
      case BLOCK_TYPES.VIDEO:
      default:
        break;
    }
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
