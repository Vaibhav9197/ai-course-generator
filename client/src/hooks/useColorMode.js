import { useTheme } from 'next-themes';

/**
 * Colour-mode hooks for Chakra UI v3.
 *
 * v3 removed `useColorMode` / `useColorModeValue` from core in favour of `next-themes`.
 * These wrappers keep the familiar API so component code never imports next-themes
 * directly — if the underlying library changes, only this file does.
 *
 * Kept separate from ColorMode.jsx so that file exports components only (Vite's fast
 * refresh cannot handle a module that mixes components with other exports).
 */
export function useColorMode() {
  const { resolvedTheme, setTheme } = useTheme();
  const toggleColorMode = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  return { colorMode: resolvedTheme, setColorMode: setTheme, toggleColorMode };
}

export function useColorModeValue(light, dark) {
  const { colorMode } = useColorMode();
  return colorMode === 'dark' ? dark : light;
}
