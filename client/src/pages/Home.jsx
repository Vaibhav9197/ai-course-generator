import { useState } from 'react';
import { Box, Container, Heading, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { useFetch } from '../hooks/useApi.js';
import { api } from '../utils/api.js';
import CourseCard from '../components/CourseCard.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

/**
 * Landing page: the course library.
 *
 * The prompt form that creates courses lands in phase 3, when there is a generation
 * endpoint for it to call.
 */
export default function Home() {
  const { data, error, loading, refetch } = useFetch('/api/courses');
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const courses = data?.courses ?? [];

  const handleDelete = async (course) => {
    setDeletingId(course.id);
    setDeleteError(null);
    try {
      await api.delete(`/api/courses/${course.id}`);
      refetch();
    } catch (err) {
      setDeleteError(err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Container maxW="6xl" py={{ base: '6', md: '10' }} px={{ base: '4', md: '6' }}>
      <Stack gap="8">
        <Stack gap="2">
          <Heading size="2xl">Your courses</Heading>
          <Text color="fg.muted">
            Every course you generate is saved here and stays available to revisit.
          </Text>
        </Stack>

        {deleteError && <ErrorMessage error={deleteError} title="Could not delete course" />}

        {loading && <LoadingSpinner label="Loading your courses…" />}

        {error && !loading && (
          <ErrorMessage error={error} onRetry={refetch} title="Could not load courses" />
        )}

        {!loading && !error && courses.length === 0 && <EmptyState />}

        {!loading && !error && courses.length > 0 && (
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap="5">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onDelete={handleDelete}
                deleting={deletingId === course.id}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}

function EmptyState() {
  return (
    <Box
      p="10"
      rounded="card"
      borderWidth="1px"
      borderStyle="dashed"
      borderColor="border.default"
      textAlign="center"
    >
      <Stack gap="2" align="center">
        <Heading size="md">No courses yet</Heading>
        <Text color="fg.muted" maxW="md">
          Run <Text as="code">npm run seed</Text> to load a sample course, or generate one
          from a topic prompt once course generation is wired up.
        </Text>
      </Stack>
    </Box>
  );
}
