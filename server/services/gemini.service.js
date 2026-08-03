import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { COURSE_OUTLINE_SCHEMA, LESSON_SCHEMA } from './geminiSchemas.js';
import { generateCoursePrompt } from './prompts/coursePrompt.js';
import { generateLessonPrompt, generateRepairPrompt } from './prompts/lessonPrompt.js';
import { parseJsonLoose, validateOutline, validateLesson } from './aiJson.service.js';

/**
 * Gemini integration.
 *
 * Model IDs come from the environment, never from source: Gemini identifiers change
 * frequently and all TTS models are still preview-tagged, so a hardcoded string is a
 * guaranteed future outage. See server/.env.example.
 */

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
      },
    });
  } catch (err) {
    throw mapUpstreamError(err);
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

function mapUpstreamError(err) {
  const message = String(err?.message ?? err);
  const status = err?.status ?? err?.code;

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
  if (/NOT_FOUND|is not found|not supported/i.test(message)) {
    return ApiError.serviceUnavailable(
      `The configured AI model ("${env.gemini.textModel}") was rejected as unknown. ` +
        'Confirm the current model IDs at ai.google.dev/gemini-api/docs/models and update GEMINI_TEXT_MODEL.',
      { cause: err },
    );
  }
  return ApiError.badGateway(`The AI service failed: ${message}`, { cause: err });
}

/**
 * Runs a generate -> parse -> validate cycle, retrying once with the validation error fed
 * back to the model.
 *
 * One retry, not more: a second failure almost always means the request itself is the
 * problem (an incoherent topic, a safety block), and each attempt costs the user another
 * 10-20 seconds of waiting.
 */
async function generateValidated({ prompt, responseSchema, validate, temperature, label }) {
  let lastError = 'unknown';
  let lastOutput = '';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const currentPrompt =
      attempt === 1
        ? prompt
        : generateRepairPrompt({
            originalPrompt: prompt,
            badOutput: lastOutput,
            validationError: lastError,
          });

    const raw = await generateText({
      prompt: currentPrompt,
      responseSchema,
      // Drop the temperature on the repair attempt: we want obedience, not creativity.
      temperature: attempt === 1 ? temperature : 0.2,
    });
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
  }

  throw ApiError.badGateway(
    `The AI could not produce valid ${label} content after two attempts. Last problem: ${lastError}`,
  );
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
    validate: (value) => validateLesson(value, { fallbackTitle: context.lessonTitle }),
    temperature: 0.7,
    label: 'lesson',
  });
}
