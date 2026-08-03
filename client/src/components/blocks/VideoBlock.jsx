import { useEffect, useState } from 'react';
import { AspectRatio, Box, Button, HStack, Icon, Skeleton, Text, VStack } from '@chakra-ui/react';
import { FiExternalLink, FiVideo } from 'react-icons/fi';
import { api } from '../../utils/api.js';

/**
 * Resolves a video *search query* to an embeddable YouTube player.
 *
 * The AI never emits URLs — model-invented video links are almost always dead — so the
 * block carries a query and the backend resolves it against the YouTube Data API behind
 * a cache. Any failure (quota exhausted, no embeddable result, endpoint not yet
 * deployed) degrades to a search link rather than an error, because a missing video
 * should never block the lesson.
 */
export function VideoBlock({ block }) {
  const query = block.query || block.url || '';
  const [state, setState] = useState({ status: 'loading', videoId: null, title: null });

  useEffect(() => {
    if (!query) {
      setState({ status: 'unavailable', videoId: null, title: null });
      return;
    }

    let cancelled = false;

    api
      .get('/api/youtube/search', { params: { query } })
      .then((res) => {
        if (cancelled) return;
        const { videoId, title } = res.data ?? {};
        setState(
          videoId
            ? { status: 'ready', videoId, title }
            : { status: 'unavailable', videoId: null, title: null },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unavailable', videoId: null, title: null });
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  if (state.status === 'loading') {
    return (
      <Box mb="6">
        <AspectRatio ratio={16 / 9}>
          <Skeleton rounded="md" />
        </AspectRatio>
      </Box>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <Box
        mb="6"
        p="6"
        rounded="md"
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="border.default"
        bg="bg.subtle"
      >
        <VStack gap="3" align="start">
          <HStack color="fg.muted">
            <Icon as={FiVideo} />
            <Text fontSize="sm" fontWeight="medium">
              Suggested video
            </Text>
          </HStack>
          <Text fontSize="sm" color="fg.muted">
            No embeddable video was available for “{query}”.
          </Text>
          <Button
            size="sm"
            variant="outline"
            as="a"
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FiExternalLink />
            Search on YouTube
          </Button>
        </VStack>
      </Box>
    );
  }

  return (
    <Box mb="6">
      <AspectRatio ratio={16 / 9} rounded="md" overflow="hidden">
        <Box
          as="iframe"
          src={`https://www.youtube-nocookie.com/embed/${state.videoId}`}
          title={state.title || `Video: ${query}`}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          border="0"
        />
      </AspectRatio>
      {state.title && (
        <Text mt="2" fontSize="sm" color="fg.muted">
          {state.title}
        </Text>
      )}
    </Box>
  );
}

export default VideoBlock;
