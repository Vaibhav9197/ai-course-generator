import mongoose from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * A section within a course. Ordered by its position in `Course.modules`.
 */
const moduleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    /** One-line summary of what the module covers. Optional — outline prompts may skip it. */
    summary: { type: String, trim: true },

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },

    lessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
  },
  { timestamps: true },
);

moduleSchema.plugin(serializePlugin);

export const Module = mongoose.model('Module', moduleSchema);
export default Module;
