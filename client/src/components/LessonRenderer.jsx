import { Box } from '@chakra-ui/react';
import { BLOCK_TYPES } from '@shared/contentBlocks.js';
import { getBlockComponent } from './blocks/index.js';

/**
 * Renders a lesson's content array by dispatching each block to its registered component.
 *
 * MCQ blocks get a running 1-based number so the quiz reads as a numbered set regardless
 * of how many prose blocks sit between them.
 */
export function LessonRenderer({ content }) {
  if (!Array.isArray(content) || content.length === 0) return null;

  let mcqCounter = 0;

  return (
    <Box>
      {content.map((block, index) => {
        if (!block || typeof block !== 'object') return null;

        const Component = getBlockComponent(block.type);
        // Unknown block type — skip it. See getBlockComponent for why this is not an error.
        if (!Component) return null;

        if (block.type === BLOCK_TYPES.MCQ) mcqCounter += 1;

        return (
          <Component
            key={`${block.type}-${index}`}
            block={block}
            index={block.type === BLOCK_TYPES.MCQ ? mcqCounter : index}
          />
        );
      })}
    </Box>
  );
}

export default LessonRenderer;
