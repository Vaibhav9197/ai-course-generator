import { Alert, Button, HStack } from '@chakra-ui/react';
import { FiRefreshCw } from 'react-icons/fi';

/**
 * Renders an error the user can act on.
 *
 * Messages arrive already normalised by the axios interceptor in utils/api.js, so this
 * component never has to interpret HTTP statuses — it just displays and offers a retry.
 */
export function ErrorMessage({ error, onRetry, title = 'Something went wrong' }) {
  if (!error) return null;

  const message = typeof error === 'string' ? error : error.message;

  return (
    <Alert.Root status="error" rounded="card" alignItems="start">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{message}</Alert.Description>
        {onRetry && (
          <HStack mt="3">
            <Button size="sm" variant="outline" onClick={onRetry}>
              <FiRefreshCw />
              Try again
            </Button>
          </HStack>
        )}
      </Alert.Content>
    </Alert.Root>
  );
}

export default ErrorMessage;
