import { useState } from 'react';
import { Alert, Box, Button, HStack, Icon, Stack, Text } from '@chakra-ui/react';
import { FiCheckCircle, FiXCircle } from 'react-icons/fi';

/**
 * A single multiple-choice question.
 *
 * State is local and intentionally not persisted: the brief asks for quizzes as a
 * comprehension aid, not for graded progress tracking, so there is no reason to send
 * answers to the server.
 *
 * Options are rendered as real <button>s in a radiogroup so keyboard and screen-reader
 * users get the same behaviour as mouse users.
 */
export function MCQBlock({ block, index }) {
  const [selected, setSelected] = useState(null);
  const options = Array.isArray(block.options) ? block.options : [];
  const correctIndex = Number(block.answer);
  const answered = selected !== null;
  const isCorrect = answered && selected === correctIndex;

  return (
    <Box
      mb="6"
      p="5"
      rounded="card"
      borderWidth="1px"
      borderColor="border.default"
      bg="bg.surface"
    >
      <Text fontWeight="semibold" mb="4">
        {typeof index === 'number' ? `${index}. ` : ''}
        {block.question}
      </Text>

      <Stack gap="2" role="radiogroup" aria-label={block.question}>
        {options.map((option, optionIndex) => {
          const state = optionState({ optionIndex, selected, correctIndex, answered });

          return (
            <Button
              key={optionIndex}
              onClick={() => !answered && setSelected(optionIndex)}
              disabled={answered && state === 'neutral'}
              role="radio"
              aria-checked={selected === optionIndex}
              variant={state === 'neutral' ? 'outline' : 'subtle'}
              colorPalette={
                state === 'correct' ? 'green' : state === 'incorrect' ? 'red' : 'gray'
              }
              justifyContent="flex-start"
              textAlign="left"
              whiteSpace="normal"
              height="auto"
              py="3"
              px="4"
              fontWeight="normal"
            >
              <HStack gap="3" width="full">
                <Text
                  as="span"
                  fontFamily="mono"
                  fontSize="xs"
                  color="fg.muted"
                  flexShrink={0}
                >
                  {String.fromCharCode(65 + optionIndex)}
                </Text>
                <Text as="span" flex="1">
                  {option}
                </Text>
                {state === 'correct' && <Icon as={FiCheckCircle} color="green.fg" />}
                {state === 'incorrect' && <Icon as={FiXCircle} color="red.fg" />}
              </HStack>
            </Button>
          );
        })}
      </Stack>

      {answered && (
        <Alert.Root status={isCorrect ? 'success' : 'error'} mt="4" rounded="md">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{isCorrect ? 'Correct' : 'Not quite'}</Alert.Title>
            {block.explanation && <Alert.Description>{block.explanation}</Alert.Description>}
          </Alert.Content>
        </Alert.Root>
      )}

      {answered && (
        <Button size="xs" variant="ghost" mt="3" onClick={() => setSelected(null)}>
          Try again
        </Button>
      )}
    </Box>
  );
}

function optionState({ optionIndex, selected, correctIndex, answered }) {
  if (!answered) return 'neutral';
  if (optionIndex === correctIndex) return 'correct';
  if (optionIndex === selected) return 'incorrect';
  return 'neutral';
}

export default MCQBlock;
