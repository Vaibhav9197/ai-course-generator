import { Heading } from '@chakra-ui/react';

/**
 * Lesson headings render as h2/h3 — never h1, which belongs to the lesson title, so the
 * document keeps exactly one top-level heading for screen readers.
 */
export function HeadingBlock({ block }) {
  const level = block.level === 3 ? 3 : 2;

  return (
    <Heading
      as={level === 3 ? 'h3' : 'h2'}
      size={level === 3 ? 'md' : 'lg'}
      mt={level === 3 ? '6' : '8'}
      mb="3"
      scrollMarginTop="20"
      id={slugify(block.text)}
    >
      {block.text}
    </Heading>
  );
}

function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

export default HeadingBlock;
