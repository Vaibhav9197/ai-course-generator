/**
 * Wraps raw PCM in a WAV container.
 *
 * Older Gemini TTS models return base64 **headerless** PCM — signed 16-bit little-endian,
 * 24 kHz, mono. Browsers and audio players cannot play that: without a container there is
 * nothing to tell them the sample rate or bit depth, so the bytes are just noise. Current
 * models return a complete WAV instead; `toWav` accepts either.
 *
 * A WAV header is 44 bytes of fixed-layout metadata, so building one is cheaper and more
 * reliable than pulling in an encoding library.
 *
 * Layout (RIFF/WAVE, PCM):
 *   0  'RIFF'              4  chunk size (= 36 + data)     8  'WAVE'
 *   12 'fmt '             16  subchunk size (= 16)         20  audio format (1 = PCM)
 *   22 channels           24  sample rate                  28  byte rate
 *   32 block align        34  bits per sample              36  'data'
 *   40 data size          44  samples…
 */

export const WAV_HEADER_BYTES = 44;

export const GEMINI_TTS_AUDIO = Object.freeze({
  sampleRate: 24_000,
  channels: 1,
  bitsPerSample: 16,
});

/**
 * @param {Buffer} pcm Raw PCM samples, no header.
 * @param {{sampleRate?: number, channels?: number, bitsPerSample?: number}} [format]
 * @returns {Buffer} A complete .wav file.
 */
export function pcmToWav(pcm, format = {}) {
  if (!Buffer.isBuffer(pcm)) {
    throw new TypeError('pcmToWav expects a Buffer of raw PCM samples.');
  }

  const sampleRate = format.sampleRate ?? GEMINI_TTS_AUDIO.sampleRate;
  const channels = format.channels ?? GEMINI_TTS_AUDIO.channels;
  const bitsPerSample = format.bitsPerSample ?? GEMINI_TTS_AUDIO.bitsPerSample;

  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  const header = Buffer.alloc(WAV_HEADER_BYTES);

  header.write('RIFF', 0, 'ascii');
  // Total file size minus the 8 bytes of 'RIFF' + this field itself.
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');

  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt subchunk length for plain PCM
  header.writeUInt16LE(1, 20); // 1 = uncompressed PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * Parses the `audio/L16;codec=pcm;rate=24000` style mime string Gemini returns, so the
 * header matches the actual audio rather than assuming the documented default.
 */
export function parseAudioMimeType(mimeType) {
  const format = { ...GEMINI_TTS_AUDIO };
  if (!mimeType) return format;

  const rate = /rate=(\d+)/i.exec(mimeType);
  if (rate) format.sampleRate = Number(rate[1]);

  // "audio/L16" means 16-bit linear PCM; the number after L is the bit depth.
  const depth = /audio\/L(\d+)/i.exec(mimeType);
  if (depth) format.bitsPerSample = Number(depth[1]);

  const channels = /channels=(\d+)/i.exec(mimeType);
  if (channels) format.channels = Number(channels[1]);

  return format;
}

/** Approximate duration in seconds, for logging and UI hints. */
export function pcmDurationSeconds(pcm, format = GEMINI_TTS_AUDIO) {
  const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8);
  return bytesPerSecond > 0 ? pcm.length / bytesPerSecond : 0;
}

/** True when the bytes already start with a RIFF/WAVE header. */
export function isWav(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= WAV_HEADER_BYTES &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  );
}

/**
 * Returns a playable .wav for whatever the TTS model sent.
 *
 * A file that is already WAV passes through untouched: wrapping it again would play the
 * inner 44-byte header as a click and make every length calculation wrong.
 */
export function toWav(audio, mimeType) {
  if (isWav(audio)) return audio;
  return pcmToWav(audio, parseAudioMimeType(mimeType));
}

/**
 * Approximate duration of a WAV, from the byte rate in its own header. Assumes the
 * canonical 44-byte layout, which is close enough for a log line.
 */
export function wavDurationSeconds(wav) {
  if (!isWav(wav)) return 0;
  const byteRate = wav.readUInt32LE(28);
  return byteRate > 0 ? (wav.length - WAV_HEADER_BYTES) / byteRate : 0;
}
