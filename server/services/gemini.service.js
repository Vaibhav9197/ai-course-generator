import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { COURSE_OUTLINE_SCHEMA, LESSON_SCHEMA } from './geminiSchemas.js';
import { generateCoursePrompt } from './prompts/coursePrompt.js';
import { generateLessonPrompt, generateRepairPrompt } from './prompts/lessonPrompt.js';
import { generateTranslatePrompt } from './prompts/translatePrompt.js';
import { parseJsonLoose, validateOutline, validateLesson } from './aiJson.service.js';
import { COURSE_LIMITS } from '../../shared/contentBlocks.js';

/**
 * Gemini integration.
 *
 * Model IDs come from the environment, never from source: Gemini identifiers change
 * frequently and older ones are withdrawn for new API keys, so a hardcoded string is a
 * guaranteed future outage. See server/.env.example.
 */

/**
 * Per-call ceiling, set through the SDK's `httpOptions.timeout`.
 *
 * Measured on the free tier: most lesson calls answer in 5-15s, but some stall upstream
 * until Google's own deadline (90s, then `504 Deadline expired`). Without a ceiling the
 * user stares at a spinner for the whole stall. So a text call is cut off at 30s and
 * generateValidated retries it once; 2 × 30s stays inside the client's 120s axios timeout.
 *
 * A fired timeout throws an AbortError, mapped to 504 below. The abandoned upstream call
 * may still complete and be billed.
 */
const TEXT_TIMEOUT_MS = 30_000;
const SPEECH_TIMEOUT_MS = 60_000;

/** Error codes for upstream failures that are worth one retry. */
const AI_TIMEOUT = 'ai_timeout';
const AI_BUSY = 'ai_busy';
const TRANSIENT_CODES = new Set([AI_TIMEOUT, AI_BUSY]);

/** Pause before retrying a "high demand" rejection; an instant retry tends to hit it again. */
const BUSY_RETRY_DELAY_MS = 1500;

const TEXT_MODEL_SETTING ={ model: () => env.gemini.textModel, envVar: 'GEMINI_TEXT_MODEL' };
const TTS_MODEL_SETTING = { model: () => env.gemini.ttsModel, envVar: 'GEMINI_TTS_MODEL' };

let client = null;

function getClient() {
  if (!env.gemini.apiKey) {
    throw ApiError.serviceUnavailable(
      'AI generation is not configured on this server (GEMINI_API_KEY is missing).',
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.gemini.apiKey });
  }
  return client;
}

export function isGeminiConfigured() {
  return Boolean(env.gemini.apiKey);
}

/** Test seam: lets tests inject a fake without touching the network. */
export function __setClientForTests(fake) {
  client = fake;
}

/**
 * One raw text-generation call. Translates SDK/transport failures into ApiErrors so
 * controllers never have to know what an upstream error looks like.
 */
async function generateText({ prompt, responseSchema, temperature = 0.7, maxOutputTokens }) {
  const ai = getClient();

  let response;
  try {
    response = await ai.models.generateContent({
      model: env.gemini.textModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        ...(responseSchema ? { responseSchema } : {}),
        temperature,
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        httpOptions: { timeout: TEXT_TIMEOUT_MS },
      },
    });
  } catch (err) {
    throw mapUpstreamError(err, TEXT_MODEL_SETTING);
  }

  const text = response?.text;
  if (!text) {
    // Usually a safety block or a hit output-token ceiling; the finish reason says which.
    const reason = response?.candidates?.[0]?.finishReason;
    throw ApiError.badGateway(
      reason
        ? `The AI returned no content (reason: ${reason}). Try rephrasing the topic.`
        : 'The AI returned an empty response. Please try again.',
    );
  }

  return text;
}

/**
 * @param {unknown} err
 * @param {{ model: () => string, envVar: string }} setting Which model setting the failed
 *   call used, so a rejected ID names the variable that actually needs changing.
 */
function mapUpstreamError(err, setting = TEXT_MODEL_SETTING) {
  const message = String(err?.message ?? err);
  const status = err?.status ?? err?.code;

  // Our own timeout firing, or Google giving up on a stalled request itself.
  if (
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    status === 504 ||
    /DEADLINE_EXCEEDED|Deadline expired/i.test(message)
  ) {
    return ApiError.gatewayTimeout(
      'The AI service took too long to respond. Please try again in a moment.',
      { cause: err, code: AI_TIMEOUT },
    );
  }
  // Google's "model is currently experiencing high demand", and its "500 Internal error"
  // during the same incidents: both are temporary, and Google's guidance is to retry.
  if (
    status === 503 ||
    status === 500 ||
    /UNAVAILABLE|high demand|overloaded|"status":\s*"INTERNAL"/i.test(message)
  ) {
    return ApiError.serviceUnavailable(
      'The AI service is busy right now. Please try again in a minute.',
      { cause: err, code: AI_BUSY },
    );
  }
  if (status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(message)) {
    return ApiError.tooManyRequests(
      'The AI service rate limit was reached. Please wait a minute and try again.',
      { cause: err },
    );
  }
  if (status === 401 || status === 403 || /API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) {
    return ApiError.serviceUnavailable(
      'The AI service rejected our credentials. Check GEMINI_API_KEY on the server.',
      { cause: err },
    );
  }
  if (/NOT_FOUND|is not found|not supported|no longer available/i.test(message)) {
    // Google's own wording is kept: "unknown" and "withdrawn for new keys" need different
    // fixes, and the upstream message says which one this is.
    return ApiError.serviceUnavailable(
      `The configured AI model ("${setting.model()}") was rejected. ` +
        `Confirm the current model IDs at ai.google.dev/gemini-api/docs/models and update ${setting.envVar}. ` +
        `Upstream said: ${message.slice(0, 300)}`,
      { cause: err },
    );
  }
  return ApiError.badGateway(`The AI service failed: ${message}`, { cause: err });
}

/**
 * Runs a generate -> parse -> validate cycle with one retry.
 *
 * The retry depends on what went wrong. Bad output is retried with the validation error
 * fed back (a repair prompt). A timed-out or "high demand" call produced nothing to
 * repair, so it is simply sent again (after a short pause for "busy"): both are
 * intermittent on the free tier and the second try often succeeds.
 *
 * One retry, not more: a second failure almost always means the request itself is the
 * problem (an incoherent topic, a safety block, an outage), and each attempt costs the
 * user more waiting.
 *
 * A validator may reject output that is still usable (a lesson short of quiz questions)
 * and attach it as `fallback` with a `score`. If no attempt fully passes, the
 * best-scoring fallback is returned instead of an error, so paying for a repair can
 * never leave the user worse off than the first attempt.
 */
async function generateValidated({ prompt, responseSchema, validate, temperature, label }) {
  let lastError = 'unknown';
  let lastOutput = '';
  let lastTransient = null;
  let best = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const isRepair = Boolean(lastOutput);
    const currentPrompt = isRepair
      ? generateRepairPrompt({
          originalPrompt: prompt,
          badOutput: lastOutput,
          validationError: lastError,
        })
      : prompt;

    let raw;
    try {
      raw = await generateText({
        prompt: currentPrompt,
        responseSchema,
        // Drop the temperature on a repair attempt: we want obedience, not creativity.
        temperature: isRepair ? 0.2 : temperature,
      });
    } catch (err) {
      // A usable earlier attempt beats any error from the retry.
      if (best) break;
      if (!TRANSIENT_CODES.has(err?.code)) throw err;
      lastTransient = err;
      console.warn(`[gemini] ${label} attempt ${attempt} failed transiently (${err.code})`);
      if (err.code === AI_BUSY && attempt === 1) await delay(BUSY_RETRY_DELAY_MS);
      continue;
    }
    lastTransient = null;
    lastOutput = raw;

    const parsed = parseJsonLoose(raw);
    if (!parsed.ok) {
      lastError = parsed.error;
      console.warn(`[gemini] ${label} attempt ${attempt} unparseable: ${parsed.error}`);
      continue;
    }

    const validated = validate(parsed.value);
    if (validated.ok) {
      if (validated.warnings?.length) {
        console.warn(`[gemini] ${label} accepted with warnings:`, validated.warnings);
      }
      return validated.value;
    }

    lastError = validated.error;
    console.warn(`[gemini] ${label} attempt ${attempt} invalid: ${validated.error}`);

    if (validated.fallback && (!best || validated.fallback.score > best.score)) {
      best = validated.fallback;
    }
  }

  if (best) {
    console.warn(`[gemini] ${label} kept the best attempt (score ${best.score}) after retrying`);
    return best.value;
  }

  if (lastTransient) throw lastTransient;

  throw ApiError.badGateway(
    `The AI could not produce valid ${label} content after two attempts. Last problem: ${lastError}`,
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stage 1: the course outline. Titles only — fast, small, and cheap enough to discard if
 * the user doesn't like the result.
 */
export async function generateCourseOutline(topic, options = {}) {
  return generateValidated({
    prompt: generateCoursePrompt(topic, options),
    responseSchema: COURSE_OUTLINE_SCHEMA,
    validate: validateOutline,
    temperature: 0.8,
    label: 'course outline',
  });
}

/**
 * Stage 2: one lesson's body. Called on first view and cached forever, so this runs at
 * most once per lesson for the lifetime of the course.
 */
export async function generateLessonContent(context) {
  return generateValidated({
    prompt: generateLessonPrompt(context),
    responseSchema: LESSON_SCHEMA,
    validate: (value) =>
      validateLesson(value, {
        fallbackTitle: context.lessonTitle,
        // Flash-Lite often emits quiz blocks with missing options or answers; asking for a
        // repair when too few survive is what keeps lessons at the brief's 4-5 questions.
        minQuestions: COURSE_LIMITS.MIN_MCQS_PER_LESSON,
      }),
    temperature: 0.7,
    label: 'lesson',
  });
}

/**
 * Translates lesson prose to Hinglish.
 *
 * Plain text out, not JSON — so this bypasses generateText, which forces a JSON mime type.
 */
export async function translateToHinglish({ lessonTitle, plainText }) {
  const ai = getClient();

  if (!plainText?.trim()) {
    throw ApiError.badRequest('This lesson has no text to translate.');
  }

  let response;
  try {
    response = await ai.models.generateContent({
      model: env.gemini.textModel,
      contents: generateTranslatePrompt(lessonTitle, plainText),
      // Low temperature: this is a translation, and invention is the failure mode.
      config: { temperature: 0.3, httpOptions: { timeout: TEXT_TIMEOUT_MS } },
    });
  } catch (err) {
    throw mapUpstreamError(err, TEXT_MODEL_SETTING);
  }

  const text = response?.text?.trim();
  if (!text) {
    throw ApiError.badGateway('The AI returned no translation. Please try again.');
  }

  return text;
}

/**
 * Synthesises speech from text.
 *
 * Returns the audio bytes plus the mime type Gemini reported. Depending on the model these
 * are headerless PCM (`audio/L16;rate=24000`) or an already complete WAV (`audio/wav`);
 * wav.service.js `toWav` handles both.
 *
 * The text is sent with no style preamble. Older TTS models treated a leading instruction
 * ("read this as a patient teacher…") as direction, but current ones speak it aloud before
 * the lesson. Tone comes from the prebuilt voice instead.
 *
 * @returns {Promise<{ audio: Buffer, mimeType: string }>}
 */
export async function synthesizeSpeech(text, { voiceName } = {}) {
  const ai = getClient();

  if (!text?.trim()) {
    throw ApiError.badRequest('There is no text to narrate.');
  }

  let response;
  try {
    response = await ai.models.generateContent({
      model: env.gemini.ttsModel,
      contents: text,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || env.gemini.ttsVoice },
          },
        },
        httpOptions: { timeout: SPEECH_TIMEOUT_MS },
      },
    });
  } catch (err) {
    throw mapUpstreamError(err, TTS_MODEL_SETTING);
  }

  const part = response?.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
  if (!part) {
    const reason = response?.candidates?.[0]?.finishReason;
    throw ApiError.badGateway(
      `The AI returned no audio${reason ? ` (reason: ${reason})` : ''}. ` +
        `Confirm GEMINI_TTS_MODEL ("${env.gemini.ttsModel}") is a current text-to-speech model.`,
    );
  }

  return {
    audio: Buffer.from(part.inlineData.data, 'base64'),
    mimeType: part.inlineData.mimeType ?? '',
  };
}
