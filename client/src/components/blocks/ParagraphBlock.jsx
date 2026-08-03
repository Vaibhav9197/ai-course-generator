import { Text } from '@chakra-ui/react';
import { renderInline } from '../../utils/markdown.jsx';

export function ParagraphBlock({ block }) {
  return (
    <Text mb="4" lineHeight="1.8" fontSize="md">
      {renderInline(block.text)}
    </Text>
  );
}

export default ParagraphBlock;
