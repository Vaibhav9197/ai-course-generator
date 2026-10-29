import { z } from 'zod';
import {
  BLOCK_TYPES,
  COURSE_LIMITS,
  DEFAULT_RESOURCE_KIND,
  RESOURCE_KINDS,
  SUPPORTED_CODE_LANGUAGES,
} from '../../shared/contentBlocks.js';

/**
 * Turning model output into data we are willing to persist.
 *
 * Gemini's schema mode guarantees *syntactically* valid JSON of roughly the right shape.
 * It does not guarantee semantics, and in practice the recurring problems are:
 *   - too many or too few modules/lessons despite explicit instructions
 *   - an MCQ `answer` index that points past the end of its own options array
 *   - a video block containing a URL instead of a search query
 *   - a stray block variant with the wrong fields for its type
 *   - occasional markdown fences when schema mode is unavailable or ignored
 *
 * The pipeline is therefore: parse (with repair) -> validate -> normalise -> report.
 *
 * Everything here is pure and synchronous. The retry loop that calls Gemini again lives in
 * gemini.service.js, so this module stays trivially testable with no network and no mocks.
 */

/* ------------------------------------------------------------------ parsing */

/**
 * Extracts a JSON value from raw model text.
 *
 * Tries a direct parse first — that is the normal path under schema mode — then falls back
 * to stripping markdown fences and finally to slicing between the outermost braces or
 * brackets, which recovers output that has prose wrapped around it.
 *
 * @returns {{ ok: true, value: unknown } | { ok: false, error: string }}
 */
export function parseJsonLoose(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'Model returned an empty response.' };

  const candidates = [text, stripFences(text), sliceOutermost(text)];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next, more aggressive, recovery strategy.
    }
  }

  return {
    ok: false,
    error: `Model response was not valid JSON (${text.length} chars, starts with "${text.slice(0, 60)}").`,
  };
}

function stripFences(text) {
  // ```json\n{...}\n```  or  ```\n{...}\n```
  const fenced = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
  return fenced ? fenced[1].trim() : null;
}

function sliceOutermost(text) {
  const firstObject = text.indexOf('{');
  const firstArray = text.indexOf('[');

  const hasObject = firstObject !== -1;
  const hasArray = firstArray !== -1;
  if (!hasObject && !hasArray) return null;

  const useObject = hasObject && (!hasArray || firstObject < firstArray);
  const start = useObject ? firstObject : firstArray;
  const end = text.lastIndexOf(useObject ? '}' : ']');

  return end > start ? text.slice(start, end + 1) : null;
}

/* ----------------------------------------------------------------- outlines */

const outlineSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional().default(''),
  tags: z.array(z.string().trim().min(1).max(40)).optional().default([]),
  modules: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(200),
        summary: z.string().trim().max(500).optional(),
        // Deliberately allows an empty array: a single empty module should not fail an
        // otherwise good outline. validateOutline drops empty modules instead, and only
        // fails if nothing usable is left.
        lessons: z.array(
          z.union([
            z.string().trim().min(2).max(200),
            z.object({ title: z.string().trim().min(2).max(200) }).transform((v) => v.title),
          ]),
        ),
      }),
    )
    .min(1),
});

/**
 * Validates and normalises a course outline.
 *
 * Clamping happens here rather than being treated as a validation failure: a model that
 * returns 7 modules has produced usable work, and dropping the extras is a far better
 * outcome for the user than a failed generation and a second round-trip.
 *
 * @returns {{ ok: true, value: object, warnings: string[] } | { ok: false, error: string }}
 */
export function validateOutline(input) {
  const parsed = outlineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }

  const warnings = [];
  const outline = parsed.data;

  let modules = outline.modules;

  if (modules.length > COURSE_LIMITS.MAX_MODULES) {
    warnings.push(
      `Model returned ${modules.length} modules; kept the first ${COURSE_LIMITS.MAX_MODULES}.`,
    );
    modules = modules.slice(0, COURSE_LIMITS.MAX_MODULES);
  }

  // A course with fewer than the minimum modules is thin but still coherent and
  // navigable, so it is reported rather than rejected.
  if (modules.length < COURSE_LIMITS.MIN_MODULES) {
    warnings.push(
      `Model returned only ${modules.length} module(s); expected at least ${COURSE_LIMITS.MIN_MODULES}.`,
    );
  }

  modules = modules.map((mod) => {
    let lessons = dedupeTitles(mod.lessons);

    if (lessons.length > COURSE_LIMITS.MAX_LESSONS_PER_MODULE) {
      warnings.push(
        `Module "${mod.title}" had ${lessons.length} lessons; kept the first ${COURSE_LIMITS.MAX_LESSONS_PER_MODULE}.`,
      );
      lessons = lessons.slice(0, COURSE_LIMITS.MAX_LESSONS_PER_MODULE);
    }

    return { ...mod, lessons };
  });

  // Drop modules left with no lessons — they would render as empty shells.
  const nonEmpty = modules.filter((mod) => mod.lessons.length > 0);
  if (nonEmpty.length !== modules.length) {
    warnings.push(`Dropped ${modules.length - nonEmpty.length} module(s) with no lessons.`);
  }

  if (nonEmpty.length === 0) {
    return { ok: false, error: 'Outline contained no modules with any lessons.' };
  }

  return {
    ok: true,
    value: {
      title: outline.title,
      description: outline.description,
      tags: dedupeTags(outline.tags),
      modules: nonEmpty,
    },
    warnings,
  };
}

/* ------------------------------------------------------------------ lessons */

const headingBlock = z.object({
  type: z.literal(BLOCK_TYPES.HEADING),
  text: z.string().trim().min(1).max(300),
  level: z.coerce.number().int().optional(),
});

const paragraphBlock = z.object({
  type: z.literal(BLOCK_TYPES.PARAGRAPH),
  text: z.string().trim().min(1).max(5000),
});

const codeBlock = z.object({
  type: z.literal(BLOCK_TYPES.CODE),
  language: z.string().trim().min(1).max(30).optional().default('text'),
  text: z.string().min(1).max(10_000),
});

const videoBlock = z.object({
  type: z.literal(BLOCK_TYPES.VIDEO),
  query: z.string().trim().min(2).max(200),
});

const mcqBlock = z.object({
  type: z.literal(BLOCK_TYPES.MCQ),
  question: z.string().trim().min(3).max(1000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  answer: z.coerce.number().int().min(0),
  explanation: z.string().trim().max(2000).optional().default(''),
});

const blockSchema = z.discriminatedUnion('type', [
  headingBlock,
  paragraphBlock,
  codeBlock,
  videoBlock,
  mcqBlock,
]);

/**
 * Cross-field checks that a per-field schema cannot express.
 *
 * These live outside the schema because z.discriminatedUnion only accepts plain object
 * schemas — attaching a .refine() to a member turns it into a ZodEffects and the union
 * refuses to build.
 *
 * @returns {string | null} A problem description, or null when the block is sound.
 */
function semanticIssue(block) {
  if (block.type === BLOCK_TYPES.MCQ) {
    // The single most common semantic failure in real output: an index that isn't a valid
    // position in this question's own options array.
    if (block.answer >= block.options.length) {
      return `answer index ${block.answer} is out of range for ${block.options.length} options`;
    }
    // Duplicate options make the question unanswerable even though every field is valid.
    const unique = new Set(block.options.map((option) => option.toLowerCase().trim()));
    if (unique.size !== block.options.length) {
      return 'options contain duplicates';
    }
  }
  return null;
}

const lessonSchema = z.object({
  title: z.string().trim().min(2).max(300).optional(),
  objectives: z.array(z.string().trim().min(3).max(500)).optional().default([]),
  content: z.array(z.unknown()).min(1),
  // Left loose here and cleaned by normalizeResources: a malformed reading list must never
  // fail an otherwise good lesson.
  resources: z.unknown().optional(),
});

/** A lesson with fewer surviving blocks than this is not worth showing. */
const MIN_USABLE_BLOCKS = 3;

/**
 * Validates and normalises one generated lesson.
 *
 * Blocks are validated individually and bad ones are dropped, rather than one malformed
 * block failing the whole lesson. Losing a single quiz question is a much better outcome
 * than discarding 2,000 words of correct prose and paying to generate it again — but if so
 * much is dropped that the lesson is no longer teachable, this fails so the caller can retry.
 *
 * @returns {{ ok: true, value: object, warnings: string[] } | { ok: false, error: string }}
 */
export function validateLesson(input, { fallbackTitle } = {}) {
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }

  const warnings = [];
  const content = [];
  let droppedBlocks = 0;

  for (const [index, candidate] of parsed.data.content.entries()) {
    const block = blockSchema.safeParse(candidate);

    if (!block.success) {
      droppedBlocks += 1;
      const type = candidate && typeof candidate === 'object' ? candidate.type : typeof candidate;
      warnings.push(`Dropped block ${index} (type "${type}"): ${formatZodError(block.error)}`);
      continue;
    }

    const issue = semanticIssue(block.data);
    if (issue) {
      droppedBlocks += 1;
      warnings.push(`Dropped block ${index} (type "${block.data.type}"): ${issue}`);
      continue;
    }

    content.push(normalizeBlock(block.data, warnings));
  }

  if (content.length < MIN_USABLE_BLOCKS) {
    return {
      ok: false,
      error:
        `Only ${content.length} of ${parsed.data.content.length} blocks were usable ` +
        `(need at least ${MIN_USABLE_BLOCKS}). First problem: ${warnings[0] ?? 'unknown'}`,
    };
  }

  if (droppedBlocks > 0) {
    warnings.unshift(`Dropped ${droppedBlocks} malformed block(s) of ${parsed.data.content.length}.`);
  }

  const mcqs = content.filter((block) => block.type === BLOCK_TYPES.MCQ);
  if (mcqs.length > COURSE_LIMITS.MAX_MCQS_PER_LESSON) {
    warnings.push(
      `Lesson had ${mcqs.length} questions; kept the first ${COURSE_LIMITS.MAX_MCQS_PER_LESSON}.`,
    );
  }

  return {
    ok: true,
    value: {
      title: parsed.data.title || fallbackTitle,
      objectives: parsed.data.objectives.slice(0, 6),
      content: capMcqs(content),
      resources: normalizeResources(parsed.data.resources, warnings),
    },
    warnings,
  };
}

/* ---------------------------------------------------------------- resources */

const resourceSchema = z.object({
  title: z.string().trim().min(3).max(200),
  kind: z.string().trim().toLowerCase().optional(),
  query: z.string().trim().min(2).max(200).optional(),
});

/**
 * Cleans the further-reading list. Never fails: the worst outcome is an empty list.
 *
 * Each entry is salvaged where possible — a missing query falls back to the title (a
 * source's name is searchable), an unknown kind becomes the default, and a URL in the
 * query is turned into search words rather than discarded, since a documentation URL's
 * host and path usually *are* the right search terms.
 */
function normalizeResources(raw, warnings) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('Resources were not a list; ignored them.');
    return [];
  }

  const resources = [];
  const seen = new Set();
  let dropped = 0;

  for (const candidate of raw) {
    const parsed = resourceSchema.safeParse(candidate);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }

    const { title } = parsed.data;
    let query = parsed.data.query || title;

    if (/^(https?:\/\/|www\.)/i.test(query)) {
      query = searchWordsFromUrl(query) || title;
      warnings.push(`Resource "${truncate(title, 40)}" had a URL as its query; converted it to search words.`);
    }

    const key = query.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);

    const kind = RESOURCE_KINDS.includes(parsed.data.kind) ? parsed.data.kind : DEFAULT_RESOURCE_KIND;
    resources.push({ title, kind, query });
  }

  if (dropped > 0) warnings.push(`Dropped ${dropped} malformed resource(s).`);

  if (resources.length > COURSE_LIMITS.MAX_RESOURCES) {
    warnings.push(
      `Lesson had ${resources.length} resources; kept the first ${COURSE_LIMITS.MAX_RESOURCES}.`,
    );
  }

  return resources.slice(0, COURSE_LIMITS.MAX_RESOURCES);
}

/** "https://react.dev/reference/rules" -> "react.dev reference rules" */
function searchWordsFromUrl(value) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./i, '');
    // \p{M} keeps combining marks, which carry meaning in non-Latin scripts.
    const path = decodeURIComponent(url.pathname).replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ');
    return `${host} ${path}`.replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

function normalizeBlock(block, warnings) {
  switch (block.type) {
    case BLOCK_TYPES.HEADING:
      // Lesson bodies never own h1 — that is the lesson title.
      return { ...block, level: block.level === 3 ? 3 : 2 };

    case BLOCK_TYPES.CODE: {
      const language = String(block.language).toLowerCase().trim();
      return {
        ...block,
        language: SUPPORTED_CODE_LANGUAGES.includes(language) ? language : 'text',
      };
    }

    case BLOCK_TYPES.VIDEO: {
      // Models occasionally emit a URL despite being told not to. Recover the searchable
      // words instead of discarding the block.
      if (/^https?:\/\//i.test(block.query) || /youtu\.?be/i.test(block.query)) {
        const recovered = block.query
          .replace(/https?:\/\/\S+/gi, ' ')
          // \p{M} keeps combining marks, which carry meaning in non-Latin scripts.
          .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        warnings.push('Video block contained a URL; converted it to a search query.');
        return { type: BLOCK_TYPES.VIDEO, query: recovered || 'tutorial' };
      }
      return block;
    }

    case BLOCK_TYPES.MCQ: {
      let options = block.options;
      let answer = block.answer;

      if (options.length > COURSE_LIMITS.MAX_MCQ_OPTIONS) {
        // Truncating could remove the correct option, so move it into range first.
        const correct = options[answer];
        options = options.slice(0, COURSE_LIMITS.MAX_MCQ_OPTIONS);
        if (!options.includes(correct)) {
          options[options.length - 1] = correct;
          answer = options.length - 1;
        } else {
          answer = options.indexOf(correct);
        }
        warnings.push(
          `Question "${truncate(block.question, 40)}" had ${block.options.length} options; trimmed to ${COURSE_LIMITS.MAX_MCQ_OPTIONS}.`,
        );
      }

      return { ...block, options, answer };
    }

    default:
      return block;
  }
}

/** Keeps at most MAX_MCQS_PER_LESSON questions, preserving all non-question blocks. */
function capMcqs(content) {
  let kept = 0;
  return content.filter((block) => {
    if (block.type !== BLOCK_TYPES.MCQ) return true;
    kept += 1;
    return kept <= COURSE_LIMITS.MAX_MCQS_PER_LESSON;
  });
}

/* ------------------------------------------------------------------ helpers */

function dedupeTitles(titles) {
  const seen = new Set();
  return titles.filter((title) => {
    const key = title.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const tag of tags) {
    const key = tag.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= 6) break;
  }
  return out;
}

/** Compact, model-readable error text — this is fed straight back in the repair prompt. */
export function formatZodError(error) {
  const issues = error?.issues ?? [];
  if (issues.length === 0) return 'Unknown validation error.';
  return issues
    .slice(0, 6)
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function truncate(text, limit) {
  const value = String(text ?? '');
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}
