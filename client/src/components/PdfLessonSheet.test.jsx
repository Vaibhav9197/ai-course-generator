import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PdfLessonSheet from './PdfLessonSheet.jsx';

/**
 * The rasterisation step needs a real browser, so it is not covered here. What is covered
 * is the part that can silently go wrong without anyone noticing: whether the print tree
 * contains the whole lesson, and whether it stays independent of the app's theme.
 *
 * Rendered without the Chakra Provider on purpose — if this tree needed theme context to
 * render, it would also inherit the user's colour mode into the PDF.
 */

const LESSON = {
  title: 'The Rules of Hooks',
  isEnriched: true,
  objectives: ['State the two rules', 'Spot a conditional hook call'],
  content: [
    { type: 'heading', text: 'Two rules, one reason', level: 2 },
    { type: 'paragraph', text: 'Call hooks at the **top level** and use `useState` freely.' },
    { type: 'code', language: 'jsx', text: 'const [a, setA] = useState(0);' },
    { type: 'video', query: 'rules of hooks explained' },
    {
      type: 'mcq',
      question: 'Why must hook order be stable?',
      options: ['For bundle size', 'React matches state by call order'],
      answer: 1,
      explanation: 'State is stored positionally per component.',
    },
    { type: 'mcq', question: 'Second question?', options: ['a', 'b'], answer: 0, explanation: 'x' },
    { type: 'some-future-block', text: 'should be skipped' },
  ],
  resources: [
    { title: 'React docs: Rules of Hooks', kind: 'documentation', query: 'react.dev rules of hooks' },
  ],
};

function renderSheet(overrides = {}) {
  const ref = createRef();
  const result = render(
    <PdfLessonSheet
      ref={ref}
      lesson={{ ...LESSON, ...overrides }}
      courseTitle="Introduction to React Hooks"
      moduleTitle="Hook Fundamentals"
    />,
  );
  return { ...result, ref };
}

describe('PdfLessonSheet', () => {
  it('renders the full lesson: header, objectives, prose, code and questions', () => {
    renderSheet();

    expect(screen.getByRole('heading', { level: 1, name: 'The Rules of Hooks' })).toBeInTheDocument();
    expect(screen.getByText(/Introduction to React Hooks/)).toBeInTheDocument();
    expect(screen.getByText('What you will learn')).toBeInTheDocument();
    expect(screen.getByText('State the two rules')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Two rules, one reason' })).toBeInTheDocument();
    expect(screen.getByText('const [a, setA] = useState(0);')).toBeInTheDocument();
    expect(screen.getByText(/Why must hook order be stable\?/)).toBeInTheDocument();
  });

  it('exposes the root element through the forwarded ref, which the exporter captures', () => {
    const { ref } = renderSheet();

    expect(ref.current).toBeInstanceOf(HTMLElement);
    // Width is pinned to A4 at 96dpi so line breaks are decided here, not by window size.
    expect(ref.current.style.width).toBe('794px');
    expect(ref.current.style.background).toBe('rgb(255, 255, 255)');
  });

  it('marks the correct answer, since the PDF is a revision artefact not a quiz', () => {
    renderSheet();

    const correct = screen.getByText(/React matches state by call order/);
    expect(correct.textContent).toContain('✓');
    expect(screen.getByText(/State is stored positionally/)).toBeInTheDocument();
  });

  it('numbers questions sequentially across the whole lesson', () => {
    renderSheet();

    expect(screen.getByText(/^1\. Why must hook order be stable/)).toBeInTheDocument();
    expect(screen.getByText(/^2\. Second question/)).toBeInTheDocument();
  });

  it('replaces the video embed with its search phrase, since a video cannot be printed', () => {
    renderSheet();

    expect(screen.getByText(/search YouTube for/)).toBeInTheDocument();
    expect(screen.getByText(/rules of hooks explained/)).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('renders inline markdown rather than leaving the syntax visible', () => {
    renderSheet();

    expect(screen.getByText('top level').tagName).toBe('STRONG');
    expect(screen.getByText('useState').tagName).toBe('CODE');
    expect(screen.queryByText(/\*\*top level\*\*/)).not.toBeInTheDocument();
  });

  it('skips unknown block types, matching the on-screen registry contract', () => {
    renderSheet();
    expect(screen.queryByText('should be skipped')).not.toBeInTheDocument();
  });

  it('uses only literal colours, never CSS variables or modern colour functions', () => {
    const { container } = renderSheet();

    // Canvas rasterisers historically fail on oklch()/lab()/color-mix() and cannot resolve
    // var(--chakra-*). Keeping the print tree free of both is what makes export reliable
    // and identical in light and dark mode.
    const styles = Array.from(container.querySelectorAll('*'))
      .map((el) => el.getAttribute('style') ?? '')
      .join(' ');

    expect(styles).not.toMatch(/var\(--/);
    expect(styles).not.toMatch(/oklch\(|lab\(|lch\(|color-mix\(/);
  });

  it('renders nothing when there is no lesson', () => {
    const { container } = render(<PdfLessonSheet lesson={null} courseTitle="x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('omits the objectives panel when the lesson has none', () => {
    renderSheet({ objectives: [] });
    expect(screen.queryByText('What you will learn')).not.toBeInTheDocument();
  });

  it('prints the further-reading list with what to search for, since a PDF cannot link', () => {
    renderSheet();

    expect(screen.getByRole('heading', { name: 'Further reading' })).toBeInTheDocument();
    expect(screen.getByText('React docs: Rules of Hooks')).toBeInTheDocument();
    expect(screen.getByText(/search for “react\.dev rules of hooks”/)).toBeInTheDocument();
  });

  it('omits the further-reading section when the lesson has no resources', () => {
    renderSheet({ resources: [] });
    expect(screen.queryByText('Further reading')).not.toBeInTheDocument();
  });
});
