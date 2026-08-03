import { useEffect } from 'react';
import { Container } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

/**
 * Auth0 redirect landing page.
 *
 * The SDK processes the authorization code on mount; this only has to wait and then move
 * the user on. `onRedirectCallback` in AuthProvider has already rewritten the URL to their
 * intended destination, so this is a brief flash in normal use.
 */
export default function Callback() {
  const { isLoading, isAuthenticated, error } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  if (error) {
    return (
      <Container maxW="lg" py="16">
        <ErrorMessage
          error={error}
          title="Sign-in failed"
          onRetry={() => navigate('/', { replace: true })}
        />
      </Container>
    );
  }

  return <LoadingSpinner label="Signing you in…" />;
}
