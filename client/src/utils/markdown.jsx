import { Code } from '@chakra-ui/react';

/**
 * Renders the deliberately tiny inline markdown subset that paragraph blocks support:
 * `**bold**` and `` `code` ``.
 *
 * A full markdown parser is not used on purpose. The AI is prompted to emit structure as
 * *blocks* rather than as markdown, so paragraphs only ever need inline emphasis. Keeping
 * this to a 20-line function avoids shipping a parser, avoids an XSS surface (no
 * dangerouslySetInnerHTML anywhere), and means unexpected markdown degrades to visible
 * literal text instead of breaking the layout.
 */
const PATTERN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

export function renderInline(text) {
  const source = String(text ?? '');
  if (!source) return null;

  const segments = source.split(PATTERN).filter((segment) => segment !== '');

  return segments.map((segment, index) => {
    const key = `${index}-${segment.slice(0, 8)}`;

    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      return <strong key={key}>{segment.slice(2, -2)}</strong>;
    }

    if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
      return (
        <Code key={key} fontSize="0.9em" px="1.5" py="0.5" colorPalette="brand">
          {segment.slice(1, -1)}
        </Code>
      );
    }

    // Preserve author-intended line breaks inside a paragraph.
    if (segment.includes('\n')) {
      return segment.split('\n').map((line, lineIndex, lines) => (
        <span key={`${key}-${lineIndex}`}>
          {line}
          {lineIndex < lines.length - 1 && <br />}
        </span>
      ));
    }

    return segment;
  });
}

/** Strips the same inline syntax, for plain-text contexts like the PDF and TTS input. */
export function stripInline(text) {
  return String(text ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}
