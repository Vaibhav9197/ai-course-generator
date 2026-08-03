import { Box, Button, Heading, HStack, Icon, Stack, Text } from '@chakra-ui/react';
import { NavLink, useParams } from 'react-router-dom';
import { FiBookOpen, FiCheckCircle, FiCircle, FiHome, FiPlus } from 'react-icons/fi';
import { useFetch } from '../hooks/useApi.js';

/**
 * Persistent navigation.
 *
 * When a course is open the sidebar becomes that course's table of contents, since
 * lesson-to-lesson movement is the dominant navigation pattern once you're reading.
 * Outside a course it lists the user's courses.
 */
export function Sidebar({ onNavigate }) {
  const { courseId } = useParams();
  const { data: courseData } = useFetch(courseId ? `/api/courses/${courseId}` : null, {
    enabled: Boolean(courseId),
  });
  const { data: listData } = useFetch('/api/courses', { enabled: !courseId });

  const course = courseData?.course;

  return (
    <Stack
      as="nav"
      aria-label="Main navigation"
      height="full"
      gap="6"
      p="4"
      overflowY="auto"
    >
      <Stack gap="1">
        <NavItem to="/" icon={FiHome} onNavigate={onNavigate} end>
          Home
        </NavItem>
      </Stack>

      {course ? (
        <Stack gap="3">
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
              Course
            </Text>
            <Heading size="sm" mt="1" lineHeight="1.3">
              {course.title}
            </Heading>
          </Box>

          <Stack gap="4">
            {course.modules?.map((mod, moduleIndex) => (
              <Stack key={mod.id ?? moduleIndex} gap="1">
                <Text fontSize="xs" fontWeight="semibold" color="fg.muted" px="2">
                  {moduleIndex + 1}. {mod.title}
                </Text>
                {mod.lessons?.map((lesson, lessonIndex) => (
                  <NavItem
                    key={lesson.id ?? lessonIndex}
                    to={`/courses/${courseId}/module/${moduleIndex}/lesson/${lessonIndex}`}
                    icon={lesson.isEnriched ? FiCheckCircle : FiCircle}
                    iconColor={lesson.isEnriched ? 'green.fg' : 'fg.muted'}
                    onNavigate={onNavigate}
                    size="sm"
                  >
                    {lesson.title}
                  </NavItem>
                ))}
              </Stack>
            ))}
          </Stack>
        </Stack>
      ) : (
        <Stack gap="2">
          <Text fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
            Your courses
          </Text>

          {listData?.courses?.length ? (
            listData.courses.slice(0, 10).map((item) => (
              <NavItem
                key={item.id}
                to={`/courses/${item.id}`}
                icon={FiBookOpen}
                onNavigate={onNavigate}
                size="sm"
              >
                {item.title}
              </NavItem>
            ))
          ) : (
            <Text fontSize="sm" color="fg.muted" px="2">
              No courses yet.
            </Text>
          )}

          <Button asChild size="sm" variant="outline" mt="2">
            <NavLink to="/" onClick={onNavigate}>
              <FiPlus />
              New course
            </NavLink>
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

function NavItem({ to, icon, iconColor = 'fg.muted', children, onNavigate, end, size = 'md' }) {
  return (
    <Box
      as={NavLink}
      to={to}
      end={end}
      onClick={onNavigate}
      px="2"
      py={size === 'sm' ? '1.5' : '2'}
      rounded="md"
      fontSize={size === 'sm' ? 'sm' : 'md'}
      color="fg.default"
      _hover={{ bg: 'bg.subtle', textDecoration: 'none' }}
      // React Router adds .active to the matching NavLink.
      css={{
        '&.active': {
          bg: 'brand.muted',
          color: 'brand.fg',
          fontWeight: 'semibold',
        },
      }}
    >
      <HStack gap="2.5" align="start">
        <Icon as={icon} color={iconColor} mt="0.5" flexShrink={0} />
        <Text as="span" lineHeight="1.4">
          {children}
        </Text>
      </HStack>
    </Box>
  );
}

export default Sidebar;
