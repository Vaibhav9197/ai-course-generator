import { useEffect, useState } from 'react';
import { Badge, Box, Container, Heading, HStack, Stack, Text } from '@chakra-ui/react';
import { ColorModeButton } from './components/ColorMode.jsx';
import { api } from './utils/api.js';

/**
 * Phase 0 scaffold check.
 *
 * This renders the backend's /api/health payload so the client -> server -> Mongo
 * wiring is verifiable before any feature code exists. Phase 2 replaces this with the
 * real layout shell (Sidebar + Topbar + <Outlet/>) and route definitions.
 */
export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/api/health')
      .then((res) => setHealth(res.data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Box minH="100dvh" bg="bg.canvas" color="fg.default">
      <Container maxW="3xl" py="16">
        <Stack gap="8">
          <HStack justify="space-between">
            <Heading size="2xl">Text-to-Learn</Heading>
            <ColorModeButton />
          </HStack>

          <Text color="fg.muted">
            AI-powered course generator. Scaffold is up — feature phases land next.
          </Text>

          <Box borderWidth="1px" borderColor="border.default" rounded="card" bg="bg.surface" p="6">
            <Heading size="md" mb="4">
              Backend status
            </Heading>

            {error && <Text color="red.500">{error}</Text>}
            {!error && !health && <Text color="fg.muted">Checking…</Text>}

            {health && (
              <Stack gap="3">
                <HStack>
                  <Text minW="24" color="fg.muted">
                    API
                  </Text>
                  <Badge colorPalette="green">up · {health.uptime}s</Badge>
                </HStack>
                {Object.entries(health.services).map(([name, ready]) => (
                  <HStack key={name}>
                    <Text minW="24" color="fg.muted" textTransform="capitalize">
                      {name}
                    </Text>
                    <Badge colorPalette={ready ? 'green' : 'gray'}>
                      {ready ? 'configured' : 'not configured'}
                    </Badge>
                  </HStack>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
