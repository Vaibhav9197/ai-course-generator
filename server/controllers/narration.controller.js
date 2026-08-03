import { Course, Lesson, Module } from '../models/index.js';
import { translateToHinglish, synthesizeSpeech } from '../services/gemini.service.js';
import { pcmToWav, parseAudioMimeType, pcmDurationSeconds } from '../services/wav.service.js';
import { currentUserSub } from '../middlewares/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { runOnce } from '../utils/inFlight.js';
import { blocksToPlainText } from '../../shared/contentBlocks.js';

/**
 * Hinglish narration.
 *
 * Two chained Gemini calls: translate the lesson prose to Hinglish, then synthesise
 * speech. The split in caching is deliberate:
 *
 *   - The translated *text* is cached on the lesson. It is small, and it is the expensive
 *     part to get right.
 *   - The *audio* is streamed and never persisted. A few minutes of 24 kHz 16-bit PCM is
 *     several megabytes, which would push against MongoDB's 16 MB document limit and force
 *     GridFS in for a feature a user triggers roughly once per lesson.
 */

/** Caps the text sent to TTS. Longer input is slow, costly, and beyond a listener's attention. */
const MAX_NARRATION_CHARS = 5000;

/**
 * Resolves a lesson from its id while verifying the caller owns the course above it.
 * Ownership lives on the Course, so it has to be walked lesson -> module -> course.
 */
async function loadOwnedLesson(lessonId, creator) {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw ApiError.notFound('Lesson not found.');

  const mod = await Module.findById(lesson.module).select('_id course title');
  if (!mod) throw ApiError.notFound('Lesson not found.');

  const course = await Course.findOne({ _id: mod.course, creator }).select('_id title');
  if (!course) throw ApiError.notFound('Lesson not found.');

  return { lesson, module: mod, course };
}

/** Reuses the cached translation, or produces and stores one. */
async function getHinglishText(lesson) {
  if (lesson.translations?.hinglish) return lesson.translations.hinglish;

  return runOnce(`translate:${lesson._id}`, async () => {
    const fresh = await Lesson.findById(lesson._id).select('translations');
    if (fresh?.translations?.hinglish) return fresh.translations.hinglish;

    const plainText = blocksToPlainText(lesson.content).slice(0, MAX_NARRATION_CHARS);
    if (!plainText) {
      throw ApiError.badRequest('This lesson has no narratable text yet.');
    }

    const hinglish = await translateToHinglish({
      lessonTitle: lesson.title,
      plainText,
    });

    await Lesson.updateOne(
      { _id: lesson._id },
      { $set: { 'translations.hinglish': hinglish } },
    );

    return hinglish;
  });
}

/**
 * POST /api/lessons/:lessonId/translate
 * Returns the Hinglish text so the UI can show it alongside the audio.
 */
export const translateLesson = asyncHandler(async (req, res) => {
  const creator = currentUserSub(req);
  const { lesson } = await loadOwnedLesson(req.params.lessonId, creator);

  if (!lesson.isEnriched) {
    throw ApiError.badRequest('Open the lesson first so its content can be generated.');
  }

  const hinglish = await getHinglishText(lesson);

  res.json({ hinglish, cached: Boolean(lesson.translations?.hinglish) });
});

/**
 * POST /api/lessons/:lessonId/audio
 * Streams a complete .wav. Not persisted — see the note at the top of this file.
 */
export const narrateLesson = asyncHandler(async (req, res) => {
  const creator = currentUserSub(req);
  const { lesson, course } = await loadOwnedLesson(req.params.lessonId, creator);

  if (!lesson.isEnriched) {
    throw ApiError.badRequest('Open the lesson first so its content can be generated.');
  }

  const language = String(req.body?.language ?? 'hinglish').toLowerCase();

  const text =
    language === 'english'
      ? blocksToPlainText(lesson.content).slice(0, MAX_NARRATION_CHARS)
      : await getHinglishText(lesson);

  if (!text) throw ApiError.badRequest('This lesson has no narratable text yet.');

  const { pcm, mimeType } = await synthesizeSpeech(text, { voiceName: req.body?.voice });
  const format = parseAudioMimeType(mimeType);
  const wav = pcmToWav(pcm, format);

  console.log(
    `[narration] lesson ${lesson._id} ${language}: ${Math.round(pcmDurationSeconds(pcm, format))}s, ${Math.round(wav.length / 1024)}kB`,
  );

  const filename = `${slug(course.title)}--${slug(lesson.title)}-${language}.wav`;

  res.set({
    'Content-Type': 'audio/wav',
    'Content-Length': String(wav.length),
    // `inline` so an <audio> element can play it; the client offers a download separately.
    'Content-Disposition': `inline; filename="${filename}"`,
    'Cache-Control': 'private, max-age=3600',
  });

  res.send(wav);
});

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'lesson';
}
