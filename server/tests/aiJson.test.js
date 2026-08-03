import { describe, expect, it } from 'vitest';
import {
  parseJsonLoose,
  validateOutline,
  validateLesson,
} from '../services/aiJson.service.js';
import { COURSE_LIMITS } from '../../shared/contentBlocks.js';

/**
 * These are the highest-value tests in the repo: AI output is the only data in the system
 * we do not control, and this module is the boundary that decides what reaches the
 * database. Every case below is a failure mode observed from real LLM output.
 */

describe('parseJsonLoose', () => {
  it('parses clean JSON', () => {
    const result = parseJsonLoose('{"title":"ok"}');
    expect(result).toEqual({ ok: true, value: { title: 'ok' } });
  });

  it('recovers JSON wrapped in a markdown fence', () => {
    const raw = '```json\n{"title":"fenced"}\n```';
    expect(parseJsonLoose(raw)).toEqual({ ok: true, value: { title: 'fenced' } });
  });

  it('recovers JSON in an unlabelled fence', () => {
    expect(parseJsonLoose('```\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('recovers JSON surrounded by prose', () => {
    const raw = 'Sure! Here is the course outline you asked for:\n{"title":"prose"}\nHope that helps!';
    expect(parseJsonLoose(raw)).toEqual({ ok: true, value: { title: 'prose' } });
  });

  it('parses a top-level array', () => {
    expect(parseJsonLoose('[1,2,3]')).toEqual({ ok: true, value: [1, 2, 3] });
  });

  it('fails on truncated JSON rather than returning something partial', () => {
    const result = parseJsonLoose('{"title":"cut off","modules":[{"title":"a"');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not valid JSON/);
  });

  it('fails on an empty response', () => {
    expect(parseJsonLoose('').ok).toBe(false);
    expect(parseJsonLoose('   ').ok).toBe(false);
    expect(parseJsonLoose(null).ok).toBe(false);
  });

  it('fails on prose with no JSON at all', () => {
    expect(parseJsonLoose('I cannot help with that request.').ok).toBe(false);
  });
});

describe('validateOutline', () => {
  const validOutline = {
    title: 'Introduction to Kubernetes',
    description: 'A practical introduction to container orchestration.',
    tags: ['kubernetes', 'devops'],
    modules: [
      { title: 'Fundamentals', lessons: ['Pods', 'Deployments', 'Services'] },
      { title: 'Networking', lessons: ['Ingress', 'DNS', 'Policies'] },
      { title: 'Operations', lessons: ['Probes', 'Autoscaling', 'Upgrades'] },
    ],
  };

  it('accepts a well-formed outline unchanged', () => {
    const result = validateOutline(validOutline);
    expect(result.ok).toBe(true);
    expect(result.value.modules).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('clamps too many modules instead of failing the generation', () => {
    const result = validateOutline({
      ...validOutline,
      modules: Array.from({ length: 9 }, (_, i) => ({
        title: `Module ${i}`,
        lessons: ['a lesson', 'b lesson', 'c lesson'],
      })),
    });

    expect(result.ok).toBe(true);
    expect(result.value.modules).toHaveLength(COURSE_LIMITS.MAX_MODULES);
    expect(result.warnings.join(' ')).toMatch(/9 modules/);
  });

  it('clamps too many lessons per module', () => {
    const result = validateOutline({
      ...validOutline,
      modules: [
        {
          title: 'Overstuffed',
          lessons: Array.from({ length: 12 }, (_, i) => `Lesson number ${i}`),
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.value.modules[0].lessons).toHaveLength(
      COURSE_LIMITS.MAX_LESSONS_PER_MODULE,
    );
  });

  it('warns but still accepts a thin outline below the module minimum', () => {
    const result = validateOutline({
      ...validOutline,
      modules: [{ title: 'Only one', lessons: ['a lesson', 'b lesson', 'c lesson'] }],
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/at least/);
  });

  it('accepts lesson titles given as objects instead of strings', () => {
    const result = validateOutline({
      ...validOutline,
      modules: [{ title: 'Mixed', lessons: [{ title: 'An object lesson' }, 'A string lesson'] }],
    });

    expect(result.ok).toBe(true);
    expect(result.value.modules[0].lessons).toEqual(['An object lesson', 'A string lesson']);
  });

  it('removes duplicate lesson titles within a module', () => {
    const result = validateOutline({
      ...validOutline,
      modules: [{ title: 'Repetitive', lessons: ['Same Thing', 'same thing', 'Other Thing'] }],
    });

    expect(result.value.modules[0].lessons).toEqual(['Same Thing', 'Other Thing']);
  });

  it('drops modules that end up with no lessons', () => {
    const result = validateOutline({
      ...validOutline,
      modules: [
        { title: 'Real', lessons: ['a lesson'] },
        { title: 'Empty', lessons: [] },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.value.modules).toHaveLength(1);
    expect(result.warnings.join(' ')).toMatch(/no lessons/);
  });

  it('fails when nothing usable remains', () => {
    const result = validateOutline({ ...validOutline, modules: [] });
    expect(result.ok).toBe(false);
  });

  it('fails on a missing title', () => {
    const result = validateOutline({ description: 'no title here', modules: validOutline.modules });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/title/);
  });

  it('normalises and caps tags', () => {
    const result = validateOutline({
      ...validOutline,
      tags: ['React', 'react', 'REACT', 'hooks', 'a', 'b', 'c', 'd', 'e'],
    });

    expect(result.value.tags).toContain('react');
    expect(result.value.tags.filter((t) => t === 'react')).toHaveLength(1);
    expect(result.value.tags.length).toBeLessThanOrEqual(6);
  });
});

describe('validateLesson', () => {
  const goodContent = [
    { type: 'heading', text: 'Getting started', level: 2 },
    { type: 'paragraph', text: 'Some explanatory prose about the topic at hand.' },
    { type: 'paragraph', text: 'More prose developing the point further.' },
    { type: 'code', language: 'javascript', text: 'const x = 1;' },
    { type: 'video', query: 'kubernetes pods explained' },
    {
      type: 'mcq',
      question: 'What is a pod?',
      options: ['A container', 'A group of containers', 'A node'],
      answer: 1,
      explanation: 'A pod is the smallest deployable unit and may hold several containers.',
    },
  ];

  it('accepts a well-formed lesson unchanged', () => {
    const result = validateLesson({
      title: 'Pods',
      objectives: ['Explain what a pod is', 'Create a pod', 'Inspect a running pod'],
      content: goodContent,
    });

    expect(result.ok).toBe(true);
    expect(result.value.content).toHaveLength(goodContent.length);
    expect(result.warnings).toEqual([]);
  });

  it('drops one malformed block but keeps the rest of the lesson', () => {
    const result = validateLesson({
      title: 'Pods',
      content: [
        ...goodContent,
        { type: 'mcq', question: 'Broken', options: ['only one'], answer: 0 },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.value.content).toHaveLength(goodContent.length);
    expect(result.warnings.join(' ')).toMatch(/Dropped 1 malformed block/);
  });

  it('rejects an MCQ whose answer index is out of range', () => {
    const result = validateLesson({
      content: [
        ...goodContent.slice(0, 5),
        {
          type: 'mcq',
          question: 'Out of range?',
          options: ['a', 'b', 'c'],
          answer: 7,
          explanation: 'nope',
        },
      ],
    });

    // The lesson survives; only the bad question is discarded.
    expect(result.ok).toBe(true);
    expect(result.value.content.some((b) => b.type === 'mcq')).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/out of range/);
  });

  it('fails when too little content survives to be teachable', () => {
    const result = validateLesson({
      content: [
        { type: 'paragraph', text: 'the only good block' },
        { type: 'mcq', question: 'bad', options: [], answer: 9 },
        { type: 'nonsense' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/usable/);
  });

  it('converts a URL in a video block into a search query', () => {
    const result = validateLesson({
      content: [
        ...goodContent.slice(0, 4),
        { type: 'video', query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      ],
    });

    expect(result.ok).toBe(true);
    const video = result.value.content.find((b) => b.type === 'video');
    expect(video.query).not.toMatch(/^https?:/);
    expect(result.warnings.join(' ')).toMatch(/contained a URL/);
  });

  it('falls back to text for an unsupported code language', () => {
    const result = validateLesson({
      content: [...goodContent.slice(0, 3), { type: 'code', language: 'brainfuck', text: '+++.' }],
    });

    const code = result.value.content.filter((b) => b.type === 'code');
    expect(code.at(-1).language).toBe('text');
  });

  it('normalises heading levels so lesson bodies never own an h1', () => {
    const result = validateLesson({
      content: [
        { type: 'heading', text: 'Should become h2', level: 1 },
        { type: 'heading', text: 'Should stay h3', level: 3 },
        { type: 'paragraph', text: 'body' },
      ],
    });

    expect(result.value.content[0].level).toBe(2);
    expect(result.value.content[1].level).toBe(3);
  });

  it('trims an over-long MCQ without discarding the correct answer', () => {
    const result = validateLesson({
      content: [
        ...goodContent.slice(0, 3),
        {
          type: 'mcq',
          question: 'Six options?',
          options: ['a', 'b', 'c', 'd', 'e', 'CORRECT'],
          answer: 5,
          explanation: 'it is the last one',
        },
      ],
    });

    const mcq = result.value.content.find((b) => b.type === 'mcq');
    expect(mcq.options).toHaveLength(COURSE_LIMITS.MAX_MCQ_OPTIONS);
    // The right answer must survive the trim, and the index must still point at it.
    expect(mcq.options[mcq.answer]).toBe('CORRECT');
  });

  it('caps the number of questions per lesson', () => {
    const manyMcqs = Array.from({ length: 9 }, (_, i) => ({
      type: 'mcq',
      question: `Question number ${i}?`,
      options: ['a', 'b', 'c'],
      answer: i % 3,
      explanation: 'because',
    }));

    const result = validateLesson({
      content: [{ type: 'paragraph', text: 'prose' }, ...manyMcqs],
    });

    const mcqs = result.value.content.filter((b) => b.type === 'mcq');
    expect(mcqs).toHaveLength(COURSE_LIMITS.MAX_MCQS_PER_LESSON);
    // Non-question blocks are untouched by the cap.
    expect(result.value.content.some((b) => b.type === 'paragraph')).toBe(true);
  });

  it('coerces a stringified answer index', () => {
    const result = validateLesson({
      content: [
        ...goodContent.slice(0, 3),
        {
          type: 'mcq',
          question: 'Stringified index?',
          options: ['a', 'b'],
          answer: '1',
          explanation: 'yes',
        },
      ],
    });

    const mcq = result.value.content.find((b) => b.type === 'mcq');
    expect(mcq.answer).toBe(1);
  });

  it('uses the fallback title when the model omits one', () => {
    const result = validateLesson({ content: goodContent }, { fallbackTitle: 'Expected Title' });
    expect(result.value.title).toBe('Expected Title');
  });

  it('fails on completely empty content', () => {
    expect(validateLesson({ content: [] }).ok).toBe(false);
  });
});
