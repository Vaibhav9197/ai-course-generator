import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { clearInFlight } from '../utils/inFlight.js';
import { WAV_HEADER_BYTES, pcmToWav } from '../services/wav.service.js';

/**
 * Verifies the caching split that the narration design depends on: translated text is
 * persisted (small, expensive to get right), audio never is (multi-megabyte, and Mongo
 * documents cap at 16 MB).
 */

const translateMock = vi.fn();
const speechMock = vi.fn();
const outlineMock = vi.fn();
const lessonMock = vi.fn();

vi.mock('../services/gemini.service.js', () => ({
  generateCourseOutline: (...a) => outlineMock(...a),
  generateLessonContent: (...a) => lessonMock(...a),
  translateToHinglish: (...a) => translateMock(...a),
  synthesizeSpeech: (...a) => speechMock(...a),
  isGeminiConfigured: () => true,
}));

const OUTLINE = {
  title: 'Introduction to Go',
  description: 'A course.',
  tags: ['go'],
  modules: [{ title: 'Basics', lessons: ['Syntax', 'Types', 'Functions'] }],
};

const LESSON = {
  title: 'Syntax',
  objectives: ['Read Go syntax'],
  content: [
    { type: 'heading', text: 'Syntax', level: 2 },
    { type: 'paragraph', text: 'Go has a deliberately **small** grammar.' },
    { type: 'code', language: 'go', text: 'package main' },
    { type: 'mcq', question: 'Q?', options: ['a', 'b'], answer: 0, explanation: 'because' },
  ],
};

const HINGLISH = 'Go की grammar जान-बूझकर छोटी रखी गई है।';
/** Half a second of silence at 24kHz/16-bit/mono. */
const PCM = Buffer.alloc(24_000);

let app;

beforeAll(async () => {
  await startMemoryDb();
  const { createApp } = await import('../app.js');
  app = createApp();
});

afterAll(async () => stopMemoryDb());

beforeEach(() => {
  outlineMock.mockReset().mockResolvedValue(OUTLINE);
  lessonMock.mockReset().mockResolvedValue(LESSON);
  translateMock.mockReset().mockResolvedValue(HINGLISH);
  speechMock.mockReset().mockResolvedValue({
    audio: PCM,
    mimeType: 'audio/L16;codec=pcm;rate=24000',
  });
  clearInFlight();
});

afterEach(async () => clearCollections());

/** Creates a course and returns the id of its first, enriched lesson. */
async function enrichedLessonId() {
  const created = await request(app).post('/api/courses/generate').send({ topic: 'Learn Go' });
  const courseId = created.body.course.id;
  const opened = await request(app).get(`/api/courses/${courseId}/module/0/lesson/0`);
  clearInFlight();
  return opened.body.lesson.id;
}

describe('POST /api/lessons/:id/translate', () => {
  it('returns Hinglish text for an enriched lesson', async () => {
    const id = await enrichedLessonId();

    const res = await request(app).post(`/api/lessons/${id}/translate`);

    expect(res.status).toBe(200);
    expect(res.body.hinglish).toBe(HINGLISH);
    expect(translateMock).toHaveBeenCalledTimes(1);
  });

  it('sends the lesson prose as plain text, with markdown and code stripped', async () => {
    const id = await enrichedLessonId();

    await request(app).post(`/api/lessons/${id}/translate`);

    const [{ plainText }] = translateMock.mock.calls[0];
    // Inline markdown must not be read aloud verbatim.
    expect(plainText).toContain('small grammar');
    expect(plainText).not.toContain('**');
    // Code is described, not dictated line by line.
    expect(plainText).not.toContain('package main');
    expect(plainText).toContain('code example in go');
  });

  it('caches the translation, so a second request costs nothing', async () => {
    const id = await enrichedLessonId();

    await request(app).post(`/api/lessons/${id}/translate`);
    clearInFlight();
    const second = await request(app).post(`/api/lessons/${id}/translate`);

    expect(second.body.hinglish).toBe(HINGLISH);
    expect(translateMock).toHaveBeenCalledTimes(1);
  });

  it('translates once when two requests race', async () => {
    const id = await enrichedLessonId();

    await Promise.all([
      request(app).post(`/api/lessons/${id}/translate`),
      request(app).post(`/api/lessons/${id}/translate`),
    ]);

    expect(translateMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/lessons/:id/audio', () => {
  it('returns a playable wav with the right headers', async () => {
    const id = await enrichedLessonId();

    const res = await request(app).post(`/api/lessons/${id}/audio`).send({ language: 'hinglish' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/wav/);
    expect(res.headers['content-disposition']).toMatch(/inline; filename=".*hinglish\.wav"/);
    expect(Number(res.headers['content-length'])).toBe(WAV_HEADER_BYTES + PCM.length);
  });

  it('wraps the raw PCM in a real RIFF/WAVE container', async () => {
    const id = await enrichedLessonId();

    const res = await request(app)
      .post(`/api/lessons/${id}/audio`)
      .send({ language: 'hinglish' })
      .buffer()
      .parse((response, callback) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    // Gemini returns headerless PCM; without this wrapping the browser plays noise.
    expect(res.body.toString('ascii', 0, 4)).toBe('RIFF');
    expect(res.body.toString('ascii', 8, 12)).toBe('WAVE');
    expect(res.body.readUInt32LE(24)).toBe(24_000);
  });

  it('passes a model-supplied WAV through without a second header', async () => {
    // Current TTS models return a complete WAV rather than raw PCM.
    const ready = pcmToWav(PCM);
    speechMock.mockResolvedValue({ audio: ready, mimeType: 'audio/wav' });
    const id = await enrichedLessonId();

    const res = await request(app)
      .post(`/api/lessons/${id}/audio`)
      .send({ language: 'hinglish' })
      .buffer()
      .parse((response, callback) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.body.equals(ready)).toBe(true);
  });

  it('narrates the Hinglish translation, not the English source', async () => {
    const id = await enrichedLessonId();

    await request(app).post(`/api/lessons/${id}/audio`).send({ language: 'hinglish' });

    expect(speechMock).toHaveBeenCalledWith(HINGLISH, expect.any(Object));
  });

  it('narrates the English source when asked', async () => {
    const id = await enrichedLessonId();

    await request(app).post(`/api/lessons/${id}/audio`).send({ language: 'english' });

    const [text] = speechMock.mock.calls[0];
    expect(text).toContain('small grammar');
    expect(translateMock).not.toHaveBeenCalled();
  });

  it('reuses a cached translation instead of re-translating for audio', async () => {
    const id = await enrichedLessonId();

    await request(app).post(`/api/lessons/${id}/translate`);
    clearInFlight();
    await request(app).post(`/api/lessons/${id}/audio`).send({ language: 'hinglish' });

    expect(translateMock).toHaveBeenCalledTimes(1);
    expect(speechMock).toHaveBeenCalledTimes(1);
  });

  it('does not persist the audio, only the text', async () => {
    const id = await enrichedLessonId();
    const { Lesson } = await import('../models/index.js');

    await request(app).post(`/api/lessons/${id}/audio`).send({ language: 'hinglish' });

    const stored = await Lesson.findById(id);
    expect(stored.translations.hinglish).toBe(HINGLISH);
    // Multi-megabyte blobs would strain the 16MB document limit and force GridFS in.
    const size = Buffer.byteLength(JSON.stringify(stored.toJSON()));
    expect(size).toBeLessThan(50_000);
  });

  it('regenerates audio on a repeat request, since nothing is stored', async () => {
    const id = await enrichedLessonId();

    await request(app).post(`/api/lessons/${id}/audio`).send({ language: 'hinglish' });
    clearInFlight();
    await request(app).post(`/api/lessons/${id}/audio`).send({ language: 'hinglish' });

    expect(speechMock).toHaveBeenCalledTimes(2);
    // But the expensive-to-get-right translation is only produced once.
    expect(translateMock).toHaveBeenCalledTimes(1);
  });

  it('rejects narration for a lesson with no content yet', async () => {
    const created = await request(app).post('/api/courses/generate').send({ topic: 'Learn Go' });
    const courseId = created.body.course.id;
    const tree = await request(app).get(`/api/courses/${courseId}`);
    // Second lesson was never opened, so it is still a stub.
    const stubId = tree.body.course.modules[0].lessons[1].id;

    const res = await request(app).post(`/api/lessons/${stubId}/audio`);

    expect(res.status).toBe(400);
    expect(speechMock).not.toHaveBeenCalled();
  });

  it('404s for an unknown lesson', async () => {
    const res = await request(app).post('/api/lessons/aaaaaaaaaaaaaaaaaaaaaaaa/audio');
    expect(res.status).toBe(404);
  });

  it('surfaces an upstream TTS failure as an error, not as a corrupt file', async () => {
    const id = await enrichedLessonId();
    speechMock.mockRejectedValue(Object.assign(new Error('TTS model unavailable'), { status: 502 }));

    const res = await request(app).post(`/api/lessons/${id}/audio`);

    expect(res.status).toBe(502);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
