import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Icon,
  List,
  Separator,
  Spacer,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Link, useParams } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight, FiTarget } from 'react-icons/fi';
import { useFetch } from '../hooks/useApi.js';
import LessonRenderer from '../components/LessonRenderer.jsx';
import LessonPDFExporter from '../components/LessonPDFExporter.jsx';
import HinglishPlayer from '../components/HinglishPlayer.jsx';
import ResourceList from '../components/ResourceList.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

/**
 * The lesson viewer.
 *
 * One request returns the lesson plus its breadcrumb and prev/next targets, so paging
 * through a course needs no extra round-trips to work out where you are.
 */
export default function Lesson() {
  const { courseId, moduleIndex, lessonIndex } = useParams();
  const url = `/api/courses/${courseId}/module/${moduleIndex}/lesson/${lessonIndex}`;
  const { data, error, loading, refetch } = useFetch(url);
  // Drives the account-level "always show the Hinglish explanation" preference.
  const { data: profile } = useFetch('/api/me');

  if (loading) {
    return (
      <LoadingSpinner
        label="Preparing this lesson…"
        hint="Lessons are written on first open, which can take up to 20 seconds. It is cached afterwards."
      />
    );
  }

  if (error) {
    return (
      <Container maxW="3xl" py="10">
        <ErrorMessage error={error} onRetry={refetch} title="Could not load lesson" />
      </Container>
    );
  }

  const { lesson, context } = data ?? {};
  if (!lesson) return null;

  const lessonPath = (target) =>
    `/courses/${courseId}/module/${target.moduleIndex}/lesson/${target.lessonIndex}`;

  return (
    <Container maxW="3xl" py={{ base: '6', md: '10' }} px={{ base: '4', md: '6' }}>
      <Stack gap="6">
        <Stack gap="2">
          <HStack fontSize="sm" color="fg.muted" gap="2" flexWrap="wrap">
            <Text asChild _hover={{ textDecoration: 'underline' }}>
              <Link to={`/courses/${courseId}`}>{context?.courseTitle}</Link>
            </Text>
            <Text>/</Text>
            <Text>{context?.moduleTitle}</Text>
            <Spacer />
            {context?.total > 0 && (
              <Text>
                Lesson {context.position} of {context.total}
              </Text>
            )}
          </HStack>

          <HStack justify="space-between" align="start" gap="4">
            <Heading size="2xl" lineHeight="1.2">
              {lesson.title}
            </Heading>
            <HStack gap="2" flexShrink={0} pt="1">
              <LessonPDFExporter
                lesson={lesson}
                courseTitle={context?.courseTitle}
                moduleTitle={context?.moduleTitle}
              />
            </HStack>
          </HStack>
        </Stack>

        {lesson.objectives?.length > 0 && (
          <Box
            p="5"
            rounded="card"
            bg="brand.subtle"
            borderWidth="1px"
            borderColor="brand.emphasized"
          >
            <HStack mb="3" gap="2">
              <Icon as={FiTarget} color="brand.fg" />
              <Text fontWeight="semibold" color="brand.fg">
                What you will learn
              </Text>
            </HStack>
            <List.Root gap="2" ps="4">
              {lesson.objectives.map((objective, index) => (
                <List.Item key={index} fontSize="sm" lineHeight="1.6">
                  {objective}
                </List.Item>
              ))}
            </List.Root>
          </Box>
        )}

        {lesson.enrichError && (
          <ErrorMessage
            error={lesson.enrichError}
            onRetry={refetch}
            title="This lesson could not be written"
          />
        )}

        {lesson.isEnriched && (
          <HinglishPlayer
            lesson={lesson}
            autoTranslate={Boolean(profile?.user?.prefs?.autoTranslateToHinglish)}
          />
        )}

        {lesson.isEnriched ? (
          <LessonRenderer content={lesson.content} />
        ) : (
          !lesson.enrichError && <PendingLesson />
        )}

        {lesson.isEnriched && <ResourceList resources={lesson.resources} />}

        <Separator />

        <HStack justify="space-between" gap="3" pb="8">
          {context?.prev ? (
            <Button asChild variant="outline" size="sm">
              <Link to={lessonPath(context.prev)}>
                <FiChevronLeft />
                Previous
              </Link>
            </Button>
          ) : (
            <Box />
          )}

          {context?.next ? (
            <Button asChild variant="solid" colorPalette="brand" size="sm">
              <Link to={lessonPath(context.next)}>
                Next
                <FiChevronRight />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to={`/courses/${courseId}`}>Back to course</Link>
            </Button>
          )}
        </HStack>
      </Stack>
    </Container>
  );
}

/**
 * Shown for a lesson that has no content and no error.
 *
 * The API generates lesson bodies on read, so this is normally unreachable — it appears
 * only when generation is unconfigured (no GEMINI_API_KEY) and the lesson was created by
 * the seed script as a stub.
 */
function PendingLesson() {
  return (
    <Box
      p="8"
      rounded="card"
      borderWidth="1px"
      borderStyle="dashed"
      borderColor="border.default"
      textAlign="center"
    >
      <Stack gap="2" align="center">
        <Heading size="md">Not written yet</Heading>
        <Text color="fg.muted" maxW="md" fontSize="sm">
          This lesson exists in the outline but has no content. Lessons are normally written
          the first time they are opened — check that the server has a Gemini API key
          configured.
        </Text>
      </Stack>
    </Box>
  );
}
