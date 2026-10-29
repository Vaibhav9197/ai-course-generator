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
    ...[1, 2, 3, 4].map((n) => question(n)),
  ],
};

/** A well-formed quiz block; lessons need at least four of these to pass validation. */
function question(n) {
  return {
    type: 'mcq',
    question: `Ownership question ${n}?`,
    options: ['Zero', 'Exactly one', 'Any number'],
    answer: 1,
    explanation: 'Ownership is unique; moves transfer it.',
  };
}

/** VALID_LESSON's prose with only `count` well-formed questions. */
function lessonWithQuestions(count) {
  const prose = VALID_LESSON.content.filter((block) => block.type !== 'mcq');
  return { ...VALID_LESSON, content: [...prose, ...Array.from({ length: count }, (_, i) => question(i + 1))] };
}

/** The shape @google/genai throws when httpOptions.timeout fires. */
function timeoutError() {
  return Object.assign(new Error('This operation was aborted'), { name: 'AbortError', code: 20 });
}

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

  it('keeps Google’s explanation when a model is withdrawn for new keys', async () => {
    // Real wording from the API: the model exists but this key may not use it.
    const err = new Error(
      '{"error":{"code":404,"message":"This model models/gemini-test-model is no longer available to new users.","status":"NOT_FOUND"}}',
    );
    gemini.__setClientForTests(fakeClient([err]));

    await expect(gemini.generateCourseOutline('Rust')).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/GEMINI_TEXT_MODEL[\s\S]*no longer available to new users/),
    });
  });

  it('bounds every call with the SDK HTTP timeout', async () => {
    const client = fakeClient([VALID_OUTLINE]);
    gemini.__setClientForTests(client);

    await gemini.generateCourseOutline('Rust');

    expect(client.calls[0].config.httpOptions.timeout).toBeGreaterThan(0);
    expect(client.calls[0].config.abortSignal).toBeUndefined();
  });

  it('resends a timed-out call unchanged and succeeds on the second try', async () => {
    const client = fakeClient([timeoutError(), VALID_OUTLINE]);
    gemini.__setClientForTests(client);

    const outline = await gemini.generateCourseOutline('Rust');

    expect(outline.title).toBe('Introduction to Rust');
    expect(client.calls).toHaveLength(2);
    // Nothing came back to repair, so the retry is the original prompt, not a repair prompt.
    expect(client.calls[1].contents).toBe(client.calls[0].contents);
  });

  it('reports 504 when both attempts time out, instead of hanging or a generic failure', async () => {
    gemini.__setClientForTests(fakeClient([timeoutError(), timeoutError()]));

    await expect(gemini.generateCourseOutline('Rust')).rejects.toMatchObject({
      status: 504,
      message: expect.stringMatching(/took too long/),
    });
  });

  it('treats Google’s own "Deadline expired" as a timeout and retries it', async () => {
    const deadline = Object.assign(
      new Error('{"error":{"code":504,"message":"Deadline expired before operation could complete.","status":"DEADLINE_EXCEEDED"}}'),
      { status: 504 },
    );
    const client = fakeClient([deadline, VALID_OUTLINE]);
    gemini.__setClientForTests(client);

    await expect(gemini.generateCourseOutline('Rust')).resolves.toMatchObject({
      title: 'Introduction to Rust',
    });
    expect(client.calls).toHaveLength(2);
  });

  // Real wording returned by the API during a load spike.
  const highDemand = () =>
    Object.assign(
      new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}'),
      { status: 503 },
    );

  it('retries a "high demand" rejection once and succeeds', async () => {
    const client = fakeClient([highDemand(), VALID_OUTLINE]);
    gemini.__setClientForTests(client);

    await expect(gemini.generateCourseOutline('Rust')).resolves.toMatchObject({
      title: 'Introduction to Rust',
    });
    expect(client.calls).toHaveLength(2);
  });

  it('reports a readable "busy" 503 rather than raw upstream JSON when it persists', async () => {
    gemini.__setClientForTests(fakeClient([highDemand(), highDemand()]));

    const error = await gemini.generateCourseOutline('Rust').catch((err) => err);

    expect(error.status).toBe(503);
    expect(error.message).toBe('The AI service is busy right now. Please try again in a minute.');
  });

  it('does not retry a permanent failure such as a rejected key', async () => {
    const client = fakeClient([new Error('API key not valid. PERMISSION_DENIED'), VALID_OUTLINE]);
    gemini.__setClientForTests(client);

    await expect(gemini.generateCourseOutline('Rust')).rejects.toMatchObject({ status: 503 });
    expect(client.calls).toHaveLength(1);
  });
});

describe('synthesizeSpeech', () => {
  function fakeSpeechClient(result) {
    const calls = [];
    return {
      calls,
      models: {
        generateContent: vi.fn(async (request) => {
          calls.push(request);
          if (result instanceof Error) throw result;
          return {
            candidates: [{ content: { parts: [{ inlineData: result }] } }],
          };
        }),
      },
    };
  }

  it('sends the text alone, with no style preamble the model would read aloud', async () => {
    const client = fakeSpeechClient({ data: 'AAAA', mimeType: 'audio/wav' });
    gemini.__setClientForTests(client);

    await gemini.synthesizeSpeech('Git ek version control system hai.');

    expect(client.calls[0].contents).toBe('Git ek version control system hai.');
    expect(client.calls[0].config.httpOptions.timeout).toBeGreaterThan(0);
    expect(client.calls[0].config.abortSignal).toBeUndefined();
  });

  it('returns the decoded audio and the reported mime type', async () => {
    gemini.__setClientForTests(fakeSpeechClient({ data: 'AAEC', mimeType: 'audio/wav' }));

    const { audio, mimeType } = await gemini.synthesizeSpeech('hello');

    expect(audio).toEqual(Buffer.from([0, 1, 2]));
    expect(mimeType).toBe('audio/wav');
  });

  it('names GEMINI_TTS_MODEL, not the text model, when the speech model is rejected', async () => {
    const err = new Error('models/some-tts is not found for API version v1beta');
    gemini.__setClientForTests(fakeSpeechClient(err));

    await expect(gemini.synthesizeSpeech('hello')).rejects.toMatchObject({
      message: expect.stringMatching(/GEMINI_TTS_MODEL/),
    });
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

  const context = { courseTitle: 'c', moduleTitle: 'm', lessonTitle: 'Ownership' };
  const countQuestions = (lesson) => lesson.content.filter((b) => b.type === 'mcq').length;
  // The real failure seen from Flash-Lite: options missing and no numeric answer.
  const brokenQuestion = { type: 'mcq', question: 'Broken?', answer: 'two' };

  it('drops a malformed question without a retry when enough good ones remain', async () => {
    const partiallyBad = { ...VALID_LESSON, content: [...VALID_LESSON.content, brokenQuestion] };
    const client = fakeClient([partiallyBad]);
    gemini.__setClientForTests(client);

    const lesson = await gemini.generateLessonContent(context);

    expect(countQuestions(lesson)).toBe(4);
    expect(client.models.generateContent).toHaveBeenCalledTimes(1);
  });

  it('asks for a repair when too few valid questions survive, and uses the repaired lesson', async () => {
    const short = { ...lessonWithQuestions(1), content: [...lessonWithQuestions(1).content, brokenQuestion] };
    const client = fakeClient([short, VALID_LESSON]);
    gemini.__setClientForTests(client);

    const lesson = await gemini.generateLessonContent(context);

    expect(countQuestions(lesson)).toBe(4);
    expect(client.calls).toHaveLength(2);
    // The repair prompt tells the model exactly what a valid question needs.
    expect(client.calls[1].contents).toMatch(/needs at least 4/);
    expect(client.calls[1].contents).toMatch(/numeric zero-based "answer"/);
  });

  it('keeps the better attempt instead of failing when the repair is still short', async () => {
    const client = fakeClient([lessonWithQuestions(2), lessonWithQuestions(1)]);
    gemini.__setClientForTests(client);

    const lesson = await gemini.generateLessonContent(context);

    expect(countQuestions(lesson)).toBe(2);
    expect(lesson.content.some((b) => b.type === 'paragraph')).toBe(true);
  });

  it('keeps the short first attempt when the repair call itself fails', async () => {
    gemini.__setClientForTests(fakeClient([lessonWithQuestions(2), timeoutError()]));

    const lesson = await gemini.generateLessonContent(context);

    expect(countQuestions(lesson)).toBe(2);
  });

  it('never makes more than two calls for one lesson', async () => {
    const client = fakeClient([lessonWithQuestions(0), lessonWithQuestions(0), VALID_LESSON]);
    gemini.__setClientForTests(client);

    await gemini.generateLessonContent(context);

    expect(client.models.generateContent).toHaveBeenCalledTimes(2);
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
