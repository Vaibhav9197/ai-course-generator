import { Badge, Box, Heading, HStack, IconButton, Stack, Text, Wrap } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { FiLayers, FiTrash2 } from 'react-icons/fi';

export function CourseCard({ course, onDelete, deleting }) {
  return (
    <Box
      p="5"
      rounded="card"
      borderWidth="1px"
      borderColor="border.default"
      bg="bg.surface"
      transition="border-color 0.15s, transform 0.15s"
      _hover={{ borderColor: 'brand.solid', transform: 'translateY(-2px)' }}
      position="relative"
    >
      <Stack gap="3" align="start">
        <HStack width="full" align="start" justify="space-between" gap="2">
          <Heading size="md" asChild lineHeight="1.3">
            <Link to={`/courses/${course.id}`}>{course.title}</Link>
          </Heading>
          {onDelete && (
            <IconButton
              aria-label={`Delete ${course.title}`}
              size="xs"
              variant="ghost"
              colorPalette="red"
              loading={deleting}
              onClick={() => onDelete(course)}
            >
              <FiTrash2 />
            </IconButton>
          )}
        </HStack>

        {course.description && (
          <Text fontSize="sm" color="fg.muted" lineClamp="3">
            {course.description}
          </Text>
        )}

        <HStack gap="4" fontSize="xs" color="fg.muted">
          <HStack gap="1.5">
            <FiLayers />
            <Text>
              {course.moduleCount} modules · {course.lessonCount} lessons
            </Text>
          </HStack>
        </HStack>

        {course.tags?.length > 0 && (
          <Wrap gap="1.5">
            {course.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} size="sm" colorPalette="brand" variant="subtle">
                {tag}
              </Badge>
            ))}
          </Wrap>
        )}
      </Stack>
    </Box>
  );
}

export default CourseCard;
