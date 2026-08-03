import { Button, Container, Heading, Stack, Text } from '@chakra-ui/react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <Container maxW="lg" py="20">
      <Stack gap="4" align="start">
        <Heading size="3xl">404</Heading>
        <Heading size="lg">Page not found</Heading>
        <Text color="fg.muted">
          That page does not exist. It may have been a course that was deleted.
        </Text>
        <Button asChild colorPalette="brand">
          <Link to="/">Back to your courses</Link>
        </Button>
      </Stack>
    </Container>
  );
}
