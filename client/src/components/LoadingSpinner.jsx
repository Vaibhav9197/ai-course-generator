import { Center, Spinner, Stack, Text } from '@chakra-ui/react';

/**
 * Indeterminate loading state.
 *
 * `label` matters more than it looks: AI generation takes 10-20 seconds, and an
 * unlabelled spinner for that long reads as a hang. Callers pass what is happening.
 */
export function LoadingSpinner({ label = 'Loading…', minH = '40vh', hint }) {
  return (
    <Center minH={minH} px="4">
      <Stack gap="4" align="center" textAlign="center">
        <Spinner size="xl" color="brand.solid" borderWidth="3px" />
        <Text color="fg.muted" fontWeight="medium">
          {label}
        </Text>
        {hint && (
          <Text color="fg.muted" fontSize="sm" maxW="sm">
            {hint}
          </Text>
        )}
      </Stack>
    </Center>
  );
}

export default LoadingSpinner;
