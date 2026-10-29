import mongoose from 'mongoose';
import { registerModel } from './registerModel.js';
import { serializePlugin } from './plugins/serialize.js';
import { isBlockType, RESOURCE_KINDS } from '../../shared/contentBlocks.js';

/** One further-reading suggestion. A search query, never a URL — see shared/contentBlocks.js. */
const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    kind: { type: String, enum: RESOURCE_KINDS, required: true },
    query: { type: String, required: true, trim: true },
  },
  { _id: false },
);

/**
 * A single lesson — the unit of AI generation and the unit of caching.
 *
 * Lessons are created as stubs by the outline pass (`content: []`, `isEnriched: false`)
 * and filled in by the enrich pass the first time a user opens them. Once enriched they
 * are never regenerated unless explicitly requested, so each lesson costs exactly one
 * Gemini call for its whole lifetime.
 */
const lessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    /** "By the end of this lesson you will be able to…" bullets. */
    objectives: [{ type: String, trim: true }],

    /** Further reading. Empty for lessons generated before this field existed. */
    resources: { type: [resourceSchema], default: [] },

    /**
     * Ordered content blocks — see shared/contentBlocks.js for the union.
     *
     * Typed as Mixed because the block shapes are heterogeneous. Deep validation happens
     * upstream in aiJson.service.js before we ever reach here; this validator is just a
     * cheap structural backstop against writing obviously malformed data.
     */
    content: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
      validate: {
        validator(blocks) {
          if (!Array.isArray(blocks)) return false;
          return blocks.every(
            (block) => block && typeof block === 'object' && isBlockType(block.type),
          );
        },
        message: 'Every content block must be an object with a known `type`.',
      },
    },

    /** False until the enrich pass has successfully populated `content`. */
    isEnriched: { type: Boolean, default: false, index: true },

    /** Set when enrichment failed, so the UI can show the reason and offer a retry. */
    enrichError: { type: String },

    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      required: true,
      index: true,
    },

    /**
     * Cached translations, keyed by language. Only the *text* is cached — audio is
     * streamed on demand and never persisted, because multi-MB PCM per lesson would
     * strain the 16 MB document limit for a feature used once per lesson.
     */
    translations: {
      hinglish: { type: String },
    },
  },
  { timestamps: true },
);

lessonSchema.plugin(serializePlugin);

/** Marks the lesson enriched and clears any previous failure in one write. */
lessonSchema.methods.applyEnrichment = function applyEnrichment({
  objectives,
  content,
  resources,
}) {
  this.objectives = objectives ?? [];
  this.content = content ?? [];
  this.resources = resources ?? [];
  this.isEnriched = true;
  this.enrichError = undefined;
  return this.save();
};

export const Lesson = registerModel('Lesson', lessonSchema);
export default Lesson;
