import mongoose from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * A generated course: the root of the Course > Module > Lesson tree.
 *
 * `modules` is an ordered array of refs. Array order is the canonical ordering because
 * the frontend routes by index (/module/:moduleIndex/lesson/:lessonIndex) — MongoDB
 * preserves array order, so no separate sort key is needed.
 */
const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    /** Auth0 `sub`. Every read and write is scoped by this. */
    creator: { type: String, required: true, index: true },

    /** The raw prompt the user typed. Kept so a course can be regenerated verbatim. */
    topicPrompt: { type: String, trim: true },

    tags: [{ type: String, trim: true }],

    modules: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Module' }],

    status: {
      type: String,
      enum: ['generating', 'ready', 'failed'],
      default: 'ready',
    },

    /** Populated when status is 'failed', so the UI can explain and offer a retry. */
    generationError: { type: String },
  },
  { timestamps: true },
);

// Backs the "my courses, newest first" listing — the app's most frequent query.
courseSchema.index({ creator: 1, createdAt: -1 });

courseSchema.plugin(serializePlugin);

/** Total lesson count, available once `modules` has been populated with lessons. */
courseSchema.virtual('lessonCount').get(function lessonCount() {
  if (!Array.isArray(this.modules)) return 0;
  return this.modules.reduce(
    (total, mod) => total + (Array.isArray(mod?.lessons) ? mod.lessons.length : 0),
    0,
  );
});

export const Course = mongoose.model('Course', courseSchema);
export default Course;
