import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { Course, Lesson, Module } from '../models/index.js';
import {
  createCourseTree,
  loadCourseTree,
  resolveLessonByIndex,
  deleteCourseTree,
} from '../services/courseTree.service.js';
import { sampleOutline, enrichedLessons } from '../fixtures/sampleCourse.js';
import { ALL_BLOCK_TYPES } from '../../shared/contentBlocks.js';

const OWNER = 'auth0|owner';
const OTHER = 'auth0|someone-else';

beforeAll(async () => {
  await startMemoryDb();
});

afterAll(async () => {
  await stopMemoryDb();
});

afterEach(async () => {
  await clearCollections();
});

describe('createCourseTree', () => {
  it('persists the outline as a linked Course > Module > Lesson tree', async () => {
    const course = await createCourseTree({
      creator: OWNER,
      outline: sampleOutline,
      topicPrompt: 'Intro to React Hooks',
    });

    expect(course.title).toBe(sampleOutline.title);
    expect(course.creator).toBe(OWNER);
    expect(course.topicPrompt).toBe('Intro to React Hooks');
    expect(course.modules).toHaveLength(sampleOutline.modules.length);

    const modules = await Module.find({ course: course._id });
    expect(modules).toHaveLength(3);

    const lessons = await Lesson.find({ module: { $in: course.modules } });
    const expectedLessons = sampleOutline.modules.reduce((n, m) => n + m.lessons.length, 0);
    expect(lessons).toHaveLength(expectedLessons);
  });

  it('creates lessons as un-enriched stubs so nothing is generated up front', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });
    const lessons = await Lesson.find({ module: { $in: course.modules } });

    expect(lessons.every((lesson) => lesson.isEnriched === false)).toBe(true);
    expect(lessons.every((lesson) => lesson.content.length === 0)).toBe(true);
  });

  it('preserves module and lesson ordering, which the index-based routes depend on', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });
    const loaded = await loadCourseTree(course._id, OWNER);

    expect(loaded.modules.map((m) => m.title)).toEqual(sampleOutline.modules.map((m) => m.title));
    expect(loaded.modules[0].lessons.map((l) => l.title)).toEqual(sampleOutline.modules[0].lessons);
  });

  it('accepts lesson titles as either strings or objects', async () => {
    const course = await createCourseTree({
      creator: OWNER,
      outline: {
        title: 'Mixed shapes',
        modules: [{ title: 'M1', lessons: ['a string lesson', { title: 'an object lesson' }] }],
      },
    });

    const loaded = await loadCourseTree(course._id, OWNER);
    expect(loaded.modules[0].lessons.map((l) => l.title)).toEqual([
      'a string lesson',
      'an object lesson',
    ]);
  });
});

describe('loadCourseTree', () => {
  it('omits lesson content, which the overview page never needs', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });
    const loaded = await loadCourseTree(course._id, OWNER);

    const firstLesson = loaded.modules[0].lessons[0];
    expect(firstLesson.title).toBeTruthy();
    // Projected out entirely rather than sent as an empty array — enriched lesson
    // content runs to tens of kilobytes and the overview page never reads it.
    expect(firstLesson.content).toBeUndefined();
    expect(firstLesson.isEnriched).toBe(false);
  });

  it('returns null for a course belonging to someone else', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });
    expect(await loadCourseTree(course._id, OTHER)).toBeNull();
  });
});

describe('resolveLessonByIndex', () => {
  it('maps route indices to the right lesson', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });

    const result = await resolveLessonByIndex({
      courseId: course._id,
      creator: OWNER,
      moduleIndex: 1,
      lessonIndex: 2,
    });

    expect(result.lesson.title).toBe(sampleOutline.modules[1].lessons[2]);
    expect(result.module.title).toBe(sampleOutline.modules[1].title);
  });

  it('returns null for out-of-range indices rather than throwing', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });

    for (const indices of [
      { moduleIndex: 99, lessonIndex: 0 },
      { moduleIndex: 0, lessonIndex: 99 },
      { moduleIndex: -1, lessonIndex: 0 },
    ]) {
      const result = await resolveLessonByIndex({
        courseId: course._id,
        creator: OWNER,
        ...indices,
      });
      expect(result).toBeNull();
    }
  });

  it('returns null for another user, indistinguishable from a missing course', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });

    const result = await resolveLessonByIndex({
      courseId: course._id,
      creator: OTHER,
      moduleIndex: 0,
      lessonIndex: 0,
    });

    expect(result).toBeNull();
  });
});

describe('deleteCourseTree', () => {
  it('cascades to modules and lessons', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });

    expect(await deleteCourseTree(course._id, OWNER)).toBe(true);
    expect(await Course.countDocuments()).toBe(0);
    expect(await Module.countDocuments()).toBe(0);
    expect(await Lesson.countDocuments()).toBe(0);
  });

  it('refuses to delete a course owned by someone else', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });

    expect(await deleteCourseTree(course._id, OTHER)).toBe(false);
    expect(await Course.countDocuments()).toBe(1);
    expect(await Lesson.countDocuments()).toBeGreaterThan(0);
  });
});

describe('Lesson content validation', () => {
  it('accepts every block type in the shared contract', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });
    const lesson = await Lesson.findOne({ module: { $in: course.modules } });

    await lesson.applyEnrichment({
      objectives: ['Cover every block type'],
      content: [
        { type: 'heading', text: 'H', level: 2 },
        { type: 'paragraph', text: 'P' },
        { type: 'code', language: 'javascript', text: 'const a = 1;' },
        { type: 'video', query: 'a search query' },
        { type: 'mcq', question: 'Q?', options: ['a', 'b', 'c'], answer: 0, explanation: 'E' },
      ],
    });

    const reloaded = await Lesson.findById(lesson._id);
    expect(reloaded.isEnriched).toBe(true);
    expect(reloaded.content.map((b) => b.type).sort()).toEqual([...ALL_BLOCK_TYPES].sort());
  });

  it('rejects blocks with an unknown type at write time', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });
    const lesson = await Lesson.findOne({ module: { $in: course.modules } });

    lesson.content = [{ type: 'not-a-real-block', text: 'nope' }];

    await expect(lesson.save()).rejects.toThrow(/known `type`/);
  });

  it('clears a previous enrichment error when enrichment succeeds', async () => {
    const course = await createCourseTree({ creator: OWNER, outline: sampleOutline });
    const lesson = await Lesson.findOne({ module: { $in: course.modules } });

    lesson.enrichError = 'Gemini returned invalid JSON';
    await lesson.save();

    await lesson.applyEnrichment(enrichedLessons['The Rules of Hooks']);

    const reloaded = await Lesson.findById(lesson._id);
    expect(reloaded.enrichError).toBeUndefined();
    expect(reloaded.isEnriched).toBe(true);
    expect(reloaded.objectives.length).toBeGreaterThan(0);
  });
});
