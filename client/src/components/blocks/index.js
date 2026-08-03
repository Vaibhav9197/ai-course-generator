import { BLOCK_TYPES } from '@shared/contentBlocks.js';
import HeadingBlock from './HeadingBlock.jsx';
import ParagraphBlock from './ParagraphBlock.jsx';
import CodeBlock from './CodeBlock.jsx';
import VideoBlock from './VideoBlock.jsx';
import MCQBlock from './MCQBlock.jsx';

/**
 * Maps a block `type` to its renderer.
 *
 * Keyed off the shared contract's constants rather than string literals, so a rename in
 * shared/contentBlocks.js is a build error here instead of a silently blank lesson.
 */
export const blockRegistry = {
  [BLOCK_TYPES.HEADING]: HeadingBlock,
  [BLOCK_TYPES.PARAGRAPH]: ParagraphBlock,
  [BLOCK_TYPES.CODE]: CodeBlock,
  [BLOCK_TYPES.VIDEO]: VideoBlock,
  [BLOCK_TYPES.MCQ]: MCQBlock,
};

/**
 * Returns the component for a block type, or null for anything unrecognised.
 *
 * Returning null rather than throwing is deliberate: it lets the backend introduce a new
 * block type without breaking clients that are already deployed in users' browsers, and
 * means one malformed block can never blank out an entire lesson.
 */
export function getBlockComponent(type) {
  return blockRegistry[type] ?? null;
}

export { HeadingBlock, ParagraphBlock, CodeBlock, VideoBlock, MCQBlock };
