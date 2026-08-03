import { useState } from 'react';
import { Box, Button, HStack, Text } from '@chakra-ui/react';
import { FiCheck, FiCopy } from 'react-icons/fi';
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useColorMode } from '../../hooks/useColorMode.js';

/**
 * Syntax-highlighted code with a copy button.
 *
 * Uses PrismAsyncLight rather than the full Prism build: languages are fetched on demand,
 * which keeps the initial bundle small given that most lessons use one or two languages.
 */
export function CodeBlock({ block }) {
  const { colorMode } = useColorMode();
  const [copied, setCopied] = useState(false);
  const language = normalizeLanguage(block.language);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(block.text ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure context, permissions). Silently
      // leaving the button un-ticked is better than an error toast for a nicety.
    }
  };

  return (
    <Box mb="6" rounded="md" overflow="hidden" borderWidth="1px" borderColor="border.default">
      <HStack
        justify="space-between"
        px="4"
        py="2"
        bg="bg.subtle"
        borderBottomWidth="1px"
        borderColor="border.default"
      >
        <Text fontSize="xs" fontFamily="mono" color="fg.muted" textTransform="uppercase">
          {language}
        </Text>
        <Button size="xs" variant="ghost" onClick={handleCopy} aria-label="Copy code">
          {copied ? <FiCheck /> : <FiCopy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </HStack>

      <Box overflowX="auto" fontSize="sm">
        <SyntaxHighlighter
          language={language}
          style={colorMode === 'dark' ? oneDark : oneLight}
          customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
          codeTagProps={{ style: { fontFamily: 'inherit' } }}
          wrapLongLines={false}
        >
          {String(block.text ?? '')}
        </SyntaxHighlighter>
      </Box>
    </Box>
  );
}

/** Maps the aliases models commonly emit onto Prism's language ids. */
function normalizeLanguage(language) {
  const raw = String(language ?? 'text')
    .toLowerCase()
    .trim();
  const aliases = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    'c++': 'cpp',
    'c#': 'csharp',
    html: 'markup',
    xml: 'markup',
    plaintext: 'text',
    '': 'text',
  };
  return aliases[raw] ?? raw;
}

export default CodeBlock;
