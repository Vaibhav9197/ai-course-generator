import { Badge, Box, HStack, Heading, Icon, Link, Stack, Text } from '@chakra-ui/react';
import {
  FiBook,
  FiBookOpen,
  FiExternalLink,
  FiFileText,
  FiPlayCircle,
  FiTool,
} from 'react-icons/fi';
import { DEFAULT_RESOURCE_KIND, resourceSearchUrl } from '@shared/contentBlocks.js';

const KIND_META = {
  documentation: { label: 'Docs', icon: FiBookOpen },
  article: { label: 'Article', icon: FiFileText },
  book: { label: 'Book', icon: FiBook },
  course: { label: 'Course', icon: FiPlayCircle },
  tool: { label: 'Tool', icon: FiTool },
};

/**
 * The lesson's further-reading list.
 *
 * Each entry links to a web search for its query rather than to a URL: the model names a
 * real source but is not trusted to remember where it lives, so a search always lands on
 * the current page instead of a dead link. The same reasoning as video blocks.
 */
export function ResourceList({ resources }) {
  if (!Array.isArray(resources) || resources.length === 0) return null;

  return (
    <Box
      as="section"
      aria-labelledby="further-reading"
      p="5"
      rounded="card"
      borderWidth="1px"
      borderColor="border.default"
      bg="bg.surface"
    >
      <Stack gap="1" mb="4">
        <Heading as="h2" size="md" id="further-reading">
          Further reading
        </Heading>
        <Text fontSize="sm" color="fg.muted">
          Each link opens a web search for the source in a new tab.
        </Text>
      </Stack>

      <Stack as="ul" gap="3" listStyleType="none" m="0" p="0">
        {resources.map((resource, index) => {
          const meta = KIND_META[resource.kind] ?? KIND_META[DEFAULT_RESOURCE_KIND];
          return (
            <HStack as="li" key={`${resource.query}-${index}`} gap="3" align="start">
              <Icon as={meta.icon} color="brand.fg" mt="1" flexShrink={0} />
              <Stack gap="0.5" minW="0">
                <Link
                  href={resourceSearchUrl(resource.query)}
                  target="_blank"
                  rel="noopener noreferrer"
                  fontWeight="medium"
                  colorPalette="brand"
                >
                  {resource.title}
                  <Icon as={FiExternalLink} boxSize="3" ms="1" aria-hidden="true" />
                </Link>
                <HStack gap="2">
                  <Badge size="sm" variant="subtle">
                    {meta.label}
                  </Badge>
                  <Text fontSize="xs" color="fg.muted" truncate>
                    {resource.query}
                  </Text>
                </HStack>
              </Stack>
            </HStack>
          );
        })}
      </Stack>
    </Box>
  );
}

export default ResourceList;
