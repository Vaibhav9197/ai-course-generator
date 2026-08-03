import { ClientOnly, IconButton, Skeleton } from '@chakra-ui/react';
import { ThemeProvider } from 'next-themes';
import { FiMoon, FiSun } from 'react-icons/fi';
import { forwardRef } from 'react';
import { useColorMode } from '../hooks/useColorMode.js';

/**
 * Colour-mode components. The hooks live in hooks/useColorMode.js.
 */

export function ColorModeProvider(props) {
  return <ThemeProvider attribute="class" disableTransitionOnChange {...props} />;
}

export const ColorModeButton = forwardRef(function ColorModeButton(props, ref) {
  const { toggleColorMode, colorMode } = useColorMode();
  return (
    <ClientOnly fallback={<Skeleton boxSize="8" rounded="md" />}>
      <IconButton
        onClick={toggleColorMode}
        variant="ghost"
        aria-label={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}
        size="sm"
        ref={ref}
        {...props}
      >
        {colorMode === 'dark' ? <FiSun /> : <FiMoon />}
      </IconButton>
    </ClientOnly>
  );
});
