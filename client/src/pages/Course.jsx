import {
  Badge,
  Box,
  Container,
  Heading,
  HStack,
  Icon,
  Stack,
  Text,
  Wrap,
} from '@chakra-ui/react';
import { Link, useParams } from 'react-router-dom';
import { FiCheckCircle, FiChevronRight, FiCircle } from 'react-icons/fi';
import { useFetch } from '../hooks/useApi.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

/**
 * Course overview: the syllabus.
 *
 * Lesson content is deliberately absent from this response (the API projects it out), so
 * this page stays fast even for a course with thirty enriched lessons.
 */
export default function Course() {
  const { courseId } = useParams();
  const { data, error, loading, refetch } = useFetch(`/api/courses/${courseId}`);

  if (loading) return <LoadingSpinner label="Loading course…" />;
  if (error) {
    return (
      <Container maxW="4xl" py="10">
        <ErrorMessage error={error} onRetry={refetch} title="Could not load course" />
      </Container>
    );
  }

  const course = data?.course;
  if (!course) return null;

  const lessonTotal =
    course.modules?.reduce((n, mod) => n + (mod.lessons?.length ?? 0), 0) ?? 0;

  return (
    <Container maxW="4xl" py={{ base: '6', md: '10' }} px={{ base: '4', md: '6' }}>
      <Stack gap="8">
        <Stack gap="3">
          <Heading size="2xl" lineHeight="1.2">
            {course.title}
          </Heading>
          {course.description && (
            <Text color="fg.muted" fontSize="lg" lineHeight="1.7">
              {course.description}
            </Text>
          )}
          <HStack gap="4" fontSize="sm" color="fg.muted">
            <Text>
              {course.modules?.length ?? 0} modules · {lessonTotal} lessons
            </Text>
          </HStack>
          {course.tags?.length > 0 && (
            <Wrap gap="2">
              {course.tags.map((tag) => (
                <Badge key={tag} colorPalette="brand" variant="subtle">
                  {tag}
                </Badge>
              ))}
            </Wrap>
          )}
        </Stack>

        <Stack gap="6">
          {course.modules?.map((mod, moduleIndex) => (
            <Box
              key={mod.id ?? moduleIndex}
              rounded="card"
              borderWidth="1px"
              borderColor="border.default"
              bg="bg.surface"
              overflow="hidden"
            >
              <Box px="5" py="4" borderBottomWidth="1px" borderColor="border.default">
                <Text fontSize="xs" fontWeight="bold" color="brand.fg" textTransform="uppercase">
                  Module {moduleIndex + 1}
                </Text>
                <Heading size="md" mt="1">
                  {mod.title}
                </Heading>
                {mod.summary && (
                  <Text fontSize="sm" color="fg.muted" mt="1">
                    {mod.summary}
                  </Text>
                )}
              </Box>

              <Stack gap="0">
                {mod.lessons?.map((lesson, lessonIndex) => (
                  <HStack
                    key={lesson.id ?? lessonIndex}
                    asChild
                    px="5"
                    py="3"
                    justify="space-between"
                    borderBottomWidth="1px"
                    borderColor="border.default"
                    _last={{ borderBottomWidth: 0 }}
                    _hover={{ bg: 'bg.subtle', textDecoration: 'none' }}
                  >
                    <Link
                      to={`/courses/${courseId}/module/${moduleIndex}/lesson/${lessonIndex}`}
                    >
                      <HStack gap="3" minW="0">
                        <Icon
                          as={lesson.isEnriched ? FiCheckCircle : FiCircle}
                          color={lesson.isEnriched ? 'green.fg' : 'fg.muted'}
                          flexShrink={0}
                        />
                        <Text truncate>{lesson.title}</Text>
                      </HStack>
                      <Icon as={FiChevronRight} color="fg.muted" flexShrink={0} />
                    </Link>
                  </HStack>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
