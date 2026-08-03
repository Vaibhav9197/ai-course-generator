import { ChakraProvider } from '@chakra-ui/react';
import { system } from '../theme.js';
import { ColorModeProvider } from './ColorMode.jsx';

/**
 * Composes Chakra's system provider with next-themes colour mode.
 * In v3 the provider takes `value={system}` — the v2 `theme={...}` prop is gone.
 */
export function Provider({ children }) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider>{children}</ColorModeProvider>
    </ChakraProvider>
  );
}

export default Provider;
