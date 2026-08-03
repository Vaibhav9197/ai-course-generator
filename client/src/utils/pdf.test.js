import { describe, expect, it } from 'vitest';
import { pdfFilename } from './pdf.js';

describe('pdfFilename', () => {
  it('builds a readable slug from the course and lesson titles', () => {
    expect(pdfFilename('Introduction to React Hooks', 'The Rules of Hooks')).toBe(
      'introduction-to-react-hooks--the-rules-of-hooks.pdf',
    );
  });

  it('strips punctuation that is illegal or awkward in filenames', () => {
    const name = pdfFilename('C++/C# Basics: "Part 1"', 'What is a pointer?');
    expect(name).toBe('c-c-basics-part-1--what-is-a-pointer.pdf');
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
  });

  it('handles non-Latin titles without emptying the name', () => {
    expect(pdfFilename('हिंदी पाठ', 'परिचय')).toBe('हिंदी-पाठ--परिचय.pdf');
  });

  it('falls back to a default when nothing usable is supplied', () => {
    expect(pdfFilename('', '')).toBe('lesson.pdf');
    expect(pdfFilename(undefined, undefined)).toBe('lesson.pdf');
    expect(pdfFilename('!!!', '???')).toBe('lesson.pdf');
  });

  it('caps each segment so the filename stays within OS limits', () => {
    const name = pdfFilename('x'.repeat(200), 'y'.repeat(200));
    expect(name.length).toBeLessThanOrEqual(60 + 2 + 60 + 4);
  });

  it('omits the separator when only one title is present', () => {
    expect(pdfFilename('Just a course', '')).toBe('just-a-course.pdf');
  });
});
