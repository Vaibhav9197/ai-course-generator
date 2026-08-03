import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Collapsible,
  HStack,
  Icon,
  Stack,
  Text,
} from '@chakra-ui/react';
import { FiDownload, FiFileText, FiVolume2 } from 'react-icons/fi';
import { api } from '../utils/api.js';
import ErrorMessage from './ErrorMessage.jsx';

/**
 * Hinglish narration for a lesson.
 *
 * The audio arrives as a .wav blob rather than a URL, because the endpoint is
 * authenticated — an <audio src="/api/..."> tag cannot carry a bearer token. So the blob
 * is fetched through axios and handed to the player as an object URL, which also makes
 * "download" free.
 *
 * Object URLs are revoked on unmount and before each replacement; without that, every
 * regeneration leaks several megabytes for the lifetime of the tab.
 */
export function HinglishPlayer({ lesson, autoTranslate = false }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [error, setError] = useState(null);
  const urlRef = useRef(null);

  const lessonId = lesson?.id ?? lesson?._id;
  const available = Boolean(lesson?.isEnriched && lesson.content?.length);

  const releaseUrl = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  // Drop any generated audio when navigating to a different lesson.
  useEffect(() => {
    releaseUrl();
    setAudioUrl(null);
    setTranscript(null);
    setError(null);
  }, [lessonId]);

  useEffect(() => releaseUrl, []);

  const loadAudio = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(
        `/api/lessons/${lessonId}/audio`,
        { language: 'hinglish' },
        { responseType: 'blob' },
      );

      releaseUrl();
      const url = URL.createObjectURL(response.data);
      urlRef.current = url;
      setAudioUrl(url);
    } catch (err) {
      setError(await readBlobError(err));
    } finally {
      setLoading(false);
    }
  };

  const loadTranscript = async () => {
    if (transcript) return;
    setLoadingTranscript(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/lessons/${lessonId}/translate`);
      setTranscript(data.hinglish);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingTranscript(false);
    }
  };

  // Honours the account-level "always translate" preference.
  useEffect(() => {
    if (autoTranslate && available && !transcript && !loadingTranscript) loadTranscript();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on lesson/pref change only
  }, [autoTranslate, available, lessonId]);

  if (!available) return null;

  return (
    <Box
      p="5"
      rounded="card"
      borderWidth="1px"
      borderColor="border.default"
      bg="bg.surface"
      mb="6"
    >
      <Stack gap="4">
        <HStack gap="2">
          <Icon as={FiVolume2} color="brand.fg" />
          <Text fontWeight="semibold">Explain this in Hinglish</Text>
        </HStack>

        <Text fontSize="sm" color="fg.muted">
          Hear this lesson explained in Hindi with the technical terms kept in English.
        </Text>

        <HStack gap="2" flexWrap="wrap">
          <Button
            size="sm"
            colorPalette="brand"
            onClick={loadAudio}
            loading={loading}
            loadingText="Generating audio…"
          >
            <FiVolume2 />
            {audioUrl ? 'Regenerate' : 'Generate audio'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={loadTranscript}
            loading={loadingTranscript}
            disabled={Boolean(transcript)}
          >
            <FiFileText />
            {transcript ? 'Transcript ready' : 'Show transcript'}
          </Button>

          {audioUrl && (
            <Button asChild size="sm" variant="ghost">
              <a href={audioUrl} download={`${slugify(lesson.title)}-hinglish.wav`}>
                <FiDownload />
                Download .wav
              </a>
            </Button>
          )}
        </HStack>

        {loading && (
          <Text fontSize="xs" color="fg.muted">
            Translating and synthesising speech — this usually takes 10 to 30 seconds.
          </Text>
        )}

        {audioUrl && (
          // No <track> element: this is generated narration, and the "Show transcript"
          // button above serves the same purpose as captions for the same content.
          <audio controls src={audioUrl} style={{ width: '100%' }}>
            Your browser cannot play audio.
          </audio>
        )}

        {transcript && (
          <Collapsible.Root defaultOpen>
            <Collapsible.Trigger asChild>
              <Button size="xs" variant="ghost" alignSelf="start">
                Transcript
              </Button>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <Box
                mt="2"
                p="4"
                rounded="md"
                bg="bg.subtle"
                fontSize="sm"
                lineHeight="1.9"
                maxH="20rem"
                overflowY="auto"
              >
                {transcript}
              </Box>
            </Collapsible.Content>
          </Collapsible.Root>
        )}

        {error && <ErrorMessage error={error} title="Could not generate the narration" />}
      </Stack>
    </Box>
  );
}

/**
 * With responseType 'blob', an error response body is also a Blob, so the axios
 * interceptor's JSON-shaped message extraction cannot see it. Read it back as text to
 * recover the server's actual explanation instead of showing a generic failure.
 */
async function readBlobError(err) {
  const body = err?.response?.data;
  if (body instanceof Blob) {
    try {
      const parsed = JSON.parse(await body.text());
      if (parsed?.error?.message) return new Error(parsed.error.message);
    } catch {
      // Not JSON — fall through to the original error.
    }
  }
  return err;
}

function slugify(value) {
  return String(value ?? 'lesson')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'lesson';
}

export default HinglishPlayer;
