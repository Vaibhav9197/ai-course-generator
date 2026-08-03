import { useState } from 'react';
import {
  Box,
  Button,
  Collapsible,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { FiChevronDown, FiSettings, FiZap } from 'react-icons/fi';
import { api } from '../utils/api.js';
import ErrorMessage from './ErrorMessage.jsx';

const EXAMPLES = [
  'Intro to React Hooks',
  'Basics of Copyright Law',
  'Kubernetes for Backend Developers',
  'Personal Finance for Freelancers',
];

/**
 * The entry point of the whole app: a topic goes in, a course outline comes out.
 *
 * Only the outline is generated here — lesson bodies are written on first view. That is
 * what keeps this request to roughly 5-10 seconds instead of the minutes a full-course
 * generation would take.
 */
export function PromptForm({ onCreated }) {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [moduleCount, setModuleCount] = useState('');
  const [lessonsPerModule, setLessonsPerModule] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = topic.trim().length >= 3 && !submitting;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const { data } = await api.post('/api/courses/generate', {
        topic: topic.trim(),
        ...(difficulty ? { difficulty } : {}),
        ...(moduleCount ? { moduleCount: Number(moduleCount) } : {}),
        ...(lessonsPerModule ? { lessonsPerModule: Number(lessonsPerModule) } : {}),
      });
      setTopic('');
      onCreated?.(data.course);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      as="form"
      onSubmit={handleSubmit}
      p={{ base: '5', md: '6' }}
      rounded="card"
      borderWidth="1px"
      borderColor="border.default"
      bg="bg.surface"
    >
      <Stack gap="5">
        <Stack gap="1">
          <Heading size="lg">What do you want to learn?</Heading>
          <Text color="fg.muted" fontSize="sm">
            Describe a topic and we will build a structured course around it.
          </Text>
        </Stack>

        <Field.Root>
          <Textarea
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Intro to React Hooks"
            rows={2}
            maxLength={300}
            resize="vertical"
            autoFocus
            disabled={submitting}
            onKeyDown={(event) => {
              // Enter submits; Shift+Enter adds a line, matching chat-style inputs.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
          />
          <Field.HelperText>
            {topic.length > 0 ? `${topic.length}/300` : 'Press Enter to generate.'}
          </Field.HelperText>
        </Field.Root>

        <HStack gap="2" flexWrap="wrap">
          <Text fontSize="xs" color="fg.muted">
            Try:
          </Text>
          {EXAMPLES.map((example) => (
            <Button
              key={example}
              size="xs"
              variant="subtle"
              disabled={submitting}
              onClick={() => setTopic(example)}
              type="button"
            >
              {example}
            </Button>
          ))}
        </HStack>

        <Collapsible.Root>
          <Collapsible.Trigger asChild>
            <Button size="xs" variant="ghost" type="button" alignSelf="start">
              <FiSettings />
              Options
              <FiChevronDown />
            </Button>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <HStack gap="4" pt="4" flexWrap="wrap" align="end">
              <Field.Root maxW="14rem">
                <Field.Label fontSize="xs">Level</Field.Label>
                <NativeSelect.Root size="sm">
                  <NativeSelect.Field
                    value={difficulty}
                    onChange={(event) => setDifficulty(event.target.value)}
                    disabled={submitting}
                  >
                    <option value="">Automatic</option>
                    <option value="complete beginner">Complete beginner</option>
                    <option value="beginner-to-intermediate">Beginner to intermediate</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>

              <Field.Root maxW="8rem">
                <Field.Label fontSize="xs">Modules</Field.Label>
                <Input
                  size="sm"
                  type="number"
                  min="3"
                  max="6"
                  value={moduleCount}
                  onChange={(event) => setModuleCount(event.target.value)}
                  placeholder="3-6"
                  disabled={submitting}
                />
              </Field.Root>

              <Field.Root maxW="10rem">
                <Field.Label fontSize="xs">Lessons each</Field.Label>
                <Input
                  size="sm"
                  type="number"
                  min="3"
                  max="5"
                  value={lessonsPerModule}
                  onChange={(event) => setLessonsPerModule(event.target.value)}
                  placeholder="3-5"
                  disabled={submitting}
                />
              </Field.Root>
            </HStack>
          </Collapsible.Content>
        </Collapsible.Root>

        {error && <ErrorMessage error={error} title="Could not generate that course" />}

        <Button type="submit" colorPalette="brand" size="lg" disabled={!canSubmit} loading={submitting}>
          <FiZap />
          {submitting ? 'Designing your course…' : 'Generate course'}
        </Button>

        {submitting && (
          <Text fontSize="xs" color="fg.muted" textAlign="center">
            Building the outline — usually 5 to 10 seconds. Individual lessons are written
            when you open them.
          </Text>
        )}
      </Stack>
    </Box>
  );
}

export default PromptForm;
