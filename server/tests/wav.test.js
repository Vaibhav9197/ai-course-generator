import { describe, expect, it } from 'vitest';
import {
  pcmToWav,
  parseAudioMimeType,
  pcmDurationSeconds,
  WAV_HEADER_BYTES,
  GEMINI_TTS_AUDIO,
} from '../services/wav.service.js';

/**
 * The WAV header is 44 bytes at fixed offsets. Every field is asserted individually
 * because a single wrong offset or endianness produces a file that either refuses to play
 * or plays as noise — and neither failure points back at the header.
 */

/** 100 samples of 16-bit mono silence. */
const PCM = Buffer.alloc(200);

describe('pcmToWav', () => {
  it('prepends exactly 44 bytes and preserves the samples', () => {
    const wav = pcmToWav(PCM);

    expect(wav.length).toBe(WAV_HEADER_BYTES + PCM.length);
    expect(wav.subarray(WAV_HEADER_BYTES)).toEqual(PCM);
  });

  it('writes the RIFF/WAVE chunk identifiers', () => {
    const wav = pcmToWav(PCM);

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
  });

  it('writes every fmt field correctly for Gemini’s default format', () => {
    const wav = pcmToWav(PCM);

    // RIFF chunk size excludes the first 8 bytes.
    expect(wav.readUInt32LE(4)).toBe(36 + PCM.length);
    expect(wav.readUInt32LE(16)).toBe(16); // fmt subchunk length for plain PCM
    expect(wav.readUInt16LE(20)).toBe(1); // 1 = uncompressed PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(24_000); // sample rate
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
    expect(wav.readUInt32LE(40)).toBe(PCM.length); // data size
  });

  it('derives byte rate and block align from the format', () => {
    const wav = pcmToWav(PCM);

    // 24000 Hz * 1 channel * 2 bytes = 48000 bytes/sec
    expect(wav.readUInt32LE(28)).toBe(48_000);
    // 1 channel * 2 bytes = 2 bytes per frame
    expect(wav.readUInt16LE(32)).toBe(2);
  });

  it('honours a non-default format', () => {
    const wav = pcmToWav(PCM, { sampleRate: 44_100, channels: 2, bitsPerSample: 24 });

    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readUInt32LE(24)).toBe(44_100);
    expect(wav.readUInt16LE(34)).toBe(24);
    // 44100 * 2 channels * 3 bytes
    expect(wav.readUInt32LE(28)).toBe(264_600);
    expect(wav.readUInt16LE(32)).toBe(6);
  });

  it('produces a valid, if empty, file for zero-length audio', () => {
    const wav = pcmToWav(Buffer.alloc(0));

    expect(wav.length).toBe(WAV_HEADER_BYTES);
    expect(wav.readUInt32LE(40)).toBe(0);
    expect(wav.readUInt32LE(4)).toBe(36);
  });

  it('rejects anything that is not a Buffer', () => {
    expect(() => pcmToWav('not a buffer')).toThrow(TypeError);
    expect(() => pcmToWav(null)).toThrow(TypeError);
    expect(() => pcmToWav(new Uint8Array(10))).toThrow(TypeError);
  });
});

describe('parseAudioMimeType', () => {
  it('reads the sample rate Gemini reports rather than assuming the default', () => {
    const format = parseAudioMimeType('audio/L16;codec=pcm;rate=24000');

    expect(format.sampleRate).toBe(24_000);
    expect(format.bitsPerSample).toBe(16);
  });

  it('follows the reported rate when it differs from the default', () => {
    expect(parseAudioMimeType('audio/L16;codec=pcm;rate=16000').sampleRate).toBe(16_000);
    expect(parseAudioMimeType('audio/L24;rate=48000').bitsPerSample).toBe(24);
  });

  it('reads an explicit channel count', () => {
    expect(parseAudioMimeType('audio/L16;rate=24000;channels=2').channels).toBe(2);
  });

  it('falls back to the documented default for a missing or unparseable type', () => {
    for (const input of [undefined, null, '', 'audio/wav', 'nonsense']) {
      expect(parseAudioMimeType(input)).toEqual(GEMINI_TTS_AUDIO);
    }
  });

  it('is case-insensitive, since the header casing is not guaranteed', () => {
    expect(parseAudioMimeType('AUDIO/L16;RATE=16000').sampleRate).toBe(16_000);
  });
});

describe('pcmDurationSeconds', () => {
  it('computes duration from the byte length', () => {
    // 48000 bytes per second at 24kHz/16-bit/mono
    expect(pcmDurationSeconds(Buffer.alloc(48_000))).toBeCloseTo(1, 5);
    expect(pcmDurationSeconds(Buffer.alloc(24_000))).toBeCloseTo(0.5, 5);
  });

  it('returns zero for empty audio', () => {
    expect(pcmDurationSeconds(Buffer.alloc(0))).toBe(0);
  });
});
