import { Type } from '@google/genai';
import {
  ALL_BLOCK_TYPES,
  COURSE_LIMITS,
  RESOURCE_KINDS,
  SUPPORTED_CODE_LANGUAGES,
} from '../../shared/contentBlocks.js';

/**
 * Gemini `responseSchema` definitions.
 *
 * Supplying a schema alongside responseMimeType: 'application/json' makes it structurally
 * impossible for the model to wrap output in ```json fences or prepend commentary, which
 * removes the single most common failure mode of JSON-from-LLM pipelines.
 *
 * It does NOT remove the need for validation. The schema constrains shape, not semantics:
 * the model can still return eight modules, a five-option MCQ, or an answer index that
 * points past the end of the options array. aiJson.service.js handles that layer.
 */

export const COURSE_OUTLINE_SCHEMA = {
  type: Type.OBJECT,
  required: ['title', 'description', 'tags', 'modules'],
  properties: {
    title: {
      type: Type.STRING,
      description: 'A concise, specific course title. No marketing language.',
    },
    description: {
      type: Type.STRING,
      description: 'Two or three sentences on what the course covers and who it is for.',
    },
    tags: {
      type: Type.ARRAY,
      description: '3-6 lowercase single-word topic tags.',
      items: { type: Type.STRING },
    },
    modules: {
      type: Type.ARRAY,
      description: `${COURSE_LIMITS.MIN_MODULES}-${COURSE_LIMITS.MAX_MODULES} modules ordered from foundational to advanced.`,
      items: {
        type: Type.OBJECT,
        required: ['title', 'lessons'],
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING, description: 'One sentence on the module scope.' },
          lessons: {
            type: Type.ARRAY,
            description: `${COURSE_LIMITS.MIN_LESSONS_PER_MODULE}-${COURSE_LIMITS.MAX_LESSONS_PER_MODULE} lesson titles, each a single teachable idea.`,
            items: { type: Type.STRING },
          },
        },
      },
    },
  },
};

/**
 * Lesson schema.
 *
 * The content array is heterogeneous — five block variants with different required
 * fields. Gemini's schema dialect cannot express "required depending on the discriminant",
 * so every variant-specific field is declared optional here and `type` is the only
 * guaranteed one. This still gives the model the full field vocabulary and keeps output
 * parseable; per-variant correctness is enforced by Zod afterwards.
 */
export const LESSON_SCHEMA = {
  type: Type.OBJECT,
  required: ['title', 'objectives', 'content', 'resources'],
  properties: {
    title: { type: Type.STRING },
    objectives: {
      type: Type.ARRAY,
      description: '3-4 concrete, observable learning objectives.',
      items: { type: Type.STRING },
    },
    resources: {
      type: Type.ARRAY,
      description: `${COURSE_LIMITS.MIN_RESOURCES}-${COURSE_LIMITS.MAX_RESOURCES} real, well-known sources for further reading.`,
      items: {
        type: Type.OBJECT,
        required: ['title', 'kind', 'query'],
        properties: {
          title: { type: Type.STRING, description: 'The name of a real, existing source.' },
          kind: { type: Type.STRING, enum: [...RESOURCE_KINDS] },
          query: {
            type: Type.STRING,
            description: 'The web search phrase that finds this source. Never a URL.',
          },
        },
      },
    },
    content: {
      type: Type.ARRAY,
      description: 'Ordered content blocks that teach the lesson.',
      items: {
        type: Type.OBJECT,
        required: ['type'],
        properties: {
          type: {
            type: Type.STRING,
            enum: [...ALL_BLOCK_TYPES],
            description: 'Which kind of block this is.',
          },
          text: {
            type: Type.STRING,
            description: 'For heading, paragraph and code blocks.',
          },
          level: {
            type: Type.INTEGER,
            description: 'Heading blocks only: 2 or 3.',
          },
          language: {
            type: Type.STRING,
            enum: [...SUPPORTED_CODE_LANGUAGES],
            description: 'Code blocks only.',
          },
          query: {
            type: Type.STRING,
            description: 'Video blocks only: a YouTube search phrase, never a URL.',
          },
          question: { type: Type.STRING, description: 'MCQ blocks only.' },
          options: {
            type: Type.ARRAY,
            description: `MCQ blocks only: ${COURSE_LIMITS.MIN_MCQ_OPTIONS}-${COURSE_LIMITS.MAX_MCQ_OPTIONS} answer choices.`,
            items: { type: Type.STRING },
          },
          answer: {
            type: Type.INTEGER,
            description: 'MCQ blocks only: zero-based index of the correct option.',
          },
          explanation: {
            type: Type.STRING,
            description: 'MCQ blocks only: why the correct option is correct.',
          },
        },
      },
    },
  },
};
