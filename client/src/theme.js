import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

/**
 * Chakra UI v3 theming.
 *
 * v3 replaced v2's `extendTheme` with `createSystem(defaultConfig, config)`, and every
 * token value must be wrapped in an object with a `value` key. v2 snippets found online
 * will not compile against this version.
 */
const config = defineConfig({
  globalCss: {
    'html, body': {
      bg: 'bg.canvas',
      color: 'fg.default',
    },
    // Anchor scroll offset so the sticky topbar doesn't cover linked headings.
    ':target': { scrollMarginTop: '5rem' },
  },
  theme: {
    tokens: {
      fonts: {
        heading: { value: "'Inter', system-ui, -apple-system, sans-serif" },
        body: { value: "'Inter', system-ui, -apple-system, sans-serif" },
        mono: { value: "'JetBrains Mono', ui-monospace, 'Cascadia Code', monospace" },
      },
      colors: {
        brand: {
          50: { value: '#eef2ff' },
          100: { value: '#e0e7ff' },
          200: { value: '#c7d2fe' },
          300: { value: '#a5b4fc' },
          400: { value: '#818cf8' },
          500: { value: '#6366f1' },
          600: { value: '#4f46e5' },
          700: { value: '#4338ca' },
          800: { value: '#3730a3' },
          900: { value: '#312e81' },
        },
      },
      radii: {
        card: { value: '0.75rem' },
      },
    },
    semanticTokens: {
      colors: {
        brand: {
          solid: { value: { base: '{colors.brand.600}', _dark: '{colors.brand.500}' } },
          contrast: { value: '#ffffff' },
          fg: { value: { base: '{colors.brand.700}', _dark: '{colors.brand.300}' } },
          muted: { value: { base: '{colors.brand.100}', _dark: '{colors.brand.900}' } },
          subtle: { value: { base: '{colors.brand.50}', _dark: '{colors.brand.900}' } },
          emphasized: { value: { base: '{colors.brand.200}', _dark: '{colors.brand.800}' } },
          focusRing: { value: { base: '{colors.brand.500}', _dark: '{colors.brand.400}' } },
        },
        bg: {
          canvas: { value: { base: '{colors.gray.50}', _dark: '{colors.gray.950}' } },
          surface: { value: { base: '#ffffff', _dark: '{colors.gray.900}' } },
          subtle: { value: { base: '{colors.gray.100}', _dark: '{colors.gray.800}' } },
        },
        fg: {
          default: { value: { base: '{colors.gray.900}', _dark: '{colors.gray.50}' } },
          muted: { value: { base: '{colors.gray.600}', _dark: '{colors.gray.400}' } },
        },
        border: {
          default: { value: { base: '{colors.gray.200}', _dark: '{colors.gray.700}' } },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);

export default system;
