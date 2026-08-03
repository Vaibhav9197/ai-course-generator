import { useState } from 'react';
import { Box, Container, Heading, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useApi.js';
import { api } from '../utils/api.js';
import CourseCard from '../components/CourseCard.jsx';
import PromptForm from '../components/PromptForm.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

/**
 * Landing page: generate a course, and browse the ones already generated.
 */
export default function Home() {
  const navigate = useNavigate();
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
      <Stack gap="10">
        <PromptForm onCreated={(course) => navigate(`/courses/${course.id ?? course._id}`)} />

        <Stack gap="6">
          <Stack gap="2">
            <Heading size="xl">Your courses</Heading>
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
          Generate your first course using the form above.
        </Text>
      </Stack>
    </Box>
  );
}
