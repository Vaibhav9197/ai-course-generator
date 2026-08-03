/**
 * Prompt for Hinglish translation.
 *
 * The target is genuine Hinglish — Hindi grammar and sentence flow with English technical
 * vocabulary retained — not Hindi. Translating "closure" or "useState" into formal Hindi
 * would make the explanation *harder* for the audience this serves: students who study
 * technical material in English but think in Hindi.
 *
 * Devanagari script rather than romanised Hinglish, because the output is fed to a TTS
 * model and romanised Hindi is frequently mispronounced as English.
 */
export function generateTranslatePrompt(lessonTitle, plainText) {
  return `Rewrite the following lesson explanation in Hinglish for an Indian student who reads technical material in English but understands explanations better in Hindi.

RULES
- Use Hindi grammar and sentence structure, written in Devanagari script.
- KEEP these in English (transliterate into Devanagari only if the English word is genuinely awkward to read): technical terms, library and language names, function and method names, code identifiers, and standard industry jargon. For example write "function", "state", "component", "database", "useState" as-is rather than inventing Hindi equivalents.
- Do not translate code. If a code identifier appears, leave it exactly as written.
- Keep the meaning and the order of ideas identical. Do not add examples, opinions or encouragement that is not in the source.
- Write flowing prose meant to be read aloud. No bullet points, no headings, no markdown, no emoji.
- Expand nothing and summarise nothing — this is a translation, not a rewrite.

LESSON TITLE: ${lessonTitle}

TEXT TO TRANSLATE:
${plainText}

Return only the Hinglish text.`;
}

/**
 * Style instruction prefixed to the TTS input.
 *
 * Gemini's TTS is promptable: a natural-language directive before the text steers pace,
 * tone and accent. Without one it tends to read technical prose too fast for a learner.
 */
export function generateSpeechDirective(text) {
  return `Read the following aloud as a patient teacher explaining a concept to a student. Speak clearly and at a measured pace, pronouncing English technical terms the way an Indian software engineer would. Pause briefly at sentence boundaries.\n\n${text}`;
}

export default generateTranslatePrompt;
