import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exercises the generate -> parse -> validate -> repair-retry loop with a fake client, so
 * the control flow is verified without spending tokens or needing network access.
 */

const VALID_OUTLINE = {
  title: 'Introduction to Rust',
  description: 'A practical introduction to systems programming in Rust.',
  tags: ['rust', 'systems'],
  modules: [
    { title: 'Basics', lessons: ['Ownership', 'Borrowing', 'Lifetimes'] },
    { title: 'Types', lessons: ['Structs', 'Enums', 'Traits'] },
    { title: 'Practice', lessons: ['Errors', 'Testing', 'Cargo'] },
  ],
};

const VALID_LESSON = {
  title: 'Ownership',
  objectives: ['Explain ownership', 'Move a value', 'Predict a drop'],
  content: [
    { type: 'heading', text: 'Ownership', level: 2 },
    { type: 'paragraph', text: 'Every value in Rust has a single owner.' },
    { type: 'paragraph', text: 'When the owner goes out of scope the value is dropped.' },
    { type: 'video', query: 'rust ownership explained' },
    {
      type: 'mcq',
      question: 'How many owners may a value have?',
      options: ['Zero', 'Exactly one', 'Any number'],
      answer: 1,
      explanation: 'Ownership is unique; moves transfer it.',
    },
  ],
};

/** Builds a fake whose generateContent returns the queued responses in order. */
function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    models: {
      generateContent: vi.fn(async (request) => {
        calls.push(request);
        const next = responses[calls.length - 1];
        if (next instanceof Error) throw next;
        return { text: typeof next === 'string' ? next : JSON.stringify(next) };
      }),
    },
  };
}

let gemini;

beforeEach(async () => {
  vi.resetModules();
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_TEXT_MODEL = 'gemini-test-model';
  gemini = await import('../services/gemini.service.js');
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_TEXT_MODEL;
  vi.restoreAllMocks();
});

describe('generateCourseOutline', () => {
  it('returns the validated outline on a first-attempt success', async () => {
    const client = fakeClient([VALID_OUTLINE]);
    gemini.__setClientForTests(client);

    const outline = await gemini.generateCourseOutline('Rust for beginners');

    expect(outline.title).toBe('Introduction to Rust');
    expect(outline.modules).toHaveLength(3);
    expect(client.models.generateContent).toHaveBeenCalledTimes(1);
  });

  it('sends JSON mime type and a response schema', async () => {
    const client = fakeClient([VALID_OUTLINE]);
    gemini.__setClientForTests(client);

    await gemini.generateCourseOutline('Rust');

    const request = client.calls[0];
    expect(request.model).toBe('gemini-test-model');
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseSchema).toBeDefined();
  });

  it('retries once with the validation error fed back, then succeeds', async () => {
    const client = fakeClient([{ title: 'Missing everything else' }, VALID_OUTLINE]);
    gemini.__setClientForTests(client);

    const outline = await gemini.generateCourseOutline('Rust');

    expect(outline.title).toBe('Introduction to Rust');
    expect(client.models.generateContent).toHaveBeenCalledTimes(2);

    // The repair prompt must carry the specific validation error, not just retry blindly.
    const repairPrompt = client.calls[1].contents;
    expect(repairPrompt).toMatch(/rejected by a schema validator/);
    expect(repairPrompt).toMatch(/modules/);
    // Lower temperature on the repair attempt: obedience over creativity.
    expect(client.calls[1].config.temperature).toBeLessThan(client.calls[0].config.temperature);
  });

  it('recovers markdown-fenced output without needing a retry', async () => {
    const client = fakeClient([`\`\`\`json\n${JSON.stringify(VALID_OUTLINE)}\n\`\`\``]);
    gemini.__setClientForTests(client);

    const outline = await gemini.generateCourseOutline('Rust');

    expect(outline.title).toBe('Introduction to Rust');
    expect(client.models.generateContent).toHaveBeenCalledTimes(1);
  });

  it('gives up after exactly two attempts and reports the last problem', async () => {
    const client = fakeClient([{ nope: 1 }, { still: 'wrong' }]);
    gemini.__setClientForTests(client);

    await expect(gemini.generateCourseOutline('Rust')).rejects.toThrow(/after two attempts/);
    expect(client.models.generateContent).toHaveBeenCalledTimes(2);
  });

  it('maps a quota error to 429 rather than a generic failure', async () => {
    const err = new Error('RESOURCE_EXHAUSTED: quota exceeded');
    const client = fakeClient([err]);
    gemini.__setClientForTests(client);

    await expect(gemini.generateCourseOutline('Rust')).rejects.toMatchObject({ status: 429 });
  });

  it('maps a rejected API key to 503 with actionable text', async () => {
    const err = new Error('API key not valid. PERMISSION_DENIED');
    const client = fakeClient([err]);
    gemini.__setClientForTests(client);

    await expect(gemini.generateCourseOutline('Rust')).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/GEMINI_API_KEY/),
    });
  });

  it('names the offending env var when the model ID is rejected', async () => {
    const err = new Error('models/gemini-test-model is not found for API version v1beta');
    const client = fakeClient([err]);
    gemini.__setClientForTests(client);

    await expect(gemini.generateCourseOutline('Rust')).rejects.toMatchObject({
      message: expect.stringMatching(/GEMINI_TEXT_MODEL/),
    });
  });

  it('reports the finish reason when the model returns no text', async () => {
    const client = {
      models: {
        generateContent: vi.fn(async () => ({
          text: undefined,
          candidates: [{ finishReason: 'SAFETY' }],
        })),
      },
    };
    gemini.__setClientForTests(client);

    await expect(gemini.generateCourseOutline('something blocked')).rejects.toThrow(/SAFETY/);
  });
});

describe('generateLessonContent', () => {
  it('generates and validates a lesson body', async () => {
    const client = fakeClient([VALID_LESSON]);
    gemini.__setClientForTests(client);

    const lesson = await gemini.generateLessonContent({
      courseTitle: 'Introduction to Rust',
      moduleTitle: 'Basics',
      lessonTitle: 'Ownership',
      siblingLessonTitles: ['Ownership', 'Borrowing', 'Lifetimes'],
      moduleTitles: ['Basics', 'Types'],
    });

    expect(lesson.title).toBe('Ownership');
    expect(lesson.content.map((b) => b.type)).toContain('mcq');
  });

  it('passes sibling lesson titles so the model stays in scope', async () => {
    const client = fakeClient([VALID_LESSON]);
    gemini.__setClientForTests(client);

    await gemini.generateLessonContent({
      courseTitle: 'Introduction to Rust',
      moduleTitle: 'Basics',
      lessonTitle: 'Ownership',
      siblingLessonTitles: ['Ownership', 'Borrowing', 'Lifetimes'],
    });

    const prompt = client.calls[0].contents;
    expect(prompt).toMatch(/do NOT teach these/);
    expect(prompt).toMatch(/Borrowing/);
    // The lesson being written must not be listed as one to avoid.
    const avoidSection = prompt.split('do NOT teach these')[1].split('SCOPE')[0];
    expect(avoidSection).not.toMatch(/- Ownership/);
  });

  it('salvages a lesson whose questions are malformed', async () => {
    const partiallyBad = {
      ...VALID_LESSON,
      content: [
        ...VALID_LESSON.content.slice(0, 4),
        { type: 'mcq', question: 'Bad', options: ['a', 'b'], answer: 9, explanation: 'x' },
      ],
    };
    const client = fakeClient([partiallyBad]);
    gemini.__setClientForTests(client);

    const lesson = await gemini.generateLessonContent({
      courseTitle: 'c',
      moduleTitle: 'm',
      lessonTitle: 'Ownership',
    });

    // Prose survived; only the broken question was dropped. No retry needed.
    expect(lesson.content).toHaveLength(4);
    expect(client.models.generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('configuration guard', () => {
  it('fails clearly when no API key is set', async () => {
    vi.resetModules();
    delete process.env.GEMINI_API_KEY;
    const unconfigured = await import('../services/gemini.service.js');

    expect(unconfigured.isGeminiConfigured()).toBe(false);
    await expect(unconfigured.generateCourseOutline('anything')).rejects.toThrow(
      /GEMINI_API_KEY is missing/,
    );
  });
});
