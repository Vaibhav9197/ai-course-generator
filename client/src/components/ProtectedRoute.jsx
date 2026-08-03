import { Button, Container, Heading, Stack, Text } from '@chakra-ui/react';
import { FiLogIn } from 'react-icons/fi';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import ErrorMessage from './ErrorMessage.jsx';

/**
 * Gates a route behind authentication.
 *
 * Shows a sign-in prompt rather than auto-redirecting: an automatic redirect on first
 * visit means a stranger who opens a shared link is bounced to a login screen with no
 * explanation of what the site is.
 */
export function ProtectedRoute({ children }) {
  const { isLoading, isAuthenticated, login, error } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingSpinner label="Checking your session…" />;

  if (error) {
    return (
      <Container maxW="lg" py="16">
        <ErrorMessage error={error} title="Sign-in failed" />
      </Container>
    );
  }

  if (!isAuthenticated) {
    return (
      <Container maxW="lg" py="16">
        <Stack gap="5" align="start">
          <Heading size="xl">Sign in to continue</Heading>
          <Text color="fg.muted">
            Text-to-Learn turns any topic into a structured course. Sign in to generate
            courses and keep them saved to your account.
          </Text>
          <Button colorPalette="brand" size="lg" onClick={() => login(location.pathname)}>
            <FiLogIn />
            Sign in
          </Button>
        </Stack>
      </Container>
    );
  }

  return children;
}

export default ProtectedRoute;
