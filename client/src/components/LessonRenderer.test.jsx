import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALL_BLOCK_TYPES } from '@shared/contentBlocks.js';
import Provider from './Provider.jsx';
import LessonRenderer from './LessonRenderer.jsx';

// VideoBlock resolves its query through the API; stub it so these tests stay offline.
vi.mock('../utils/api.js', () => ({
  api: { get: vi.fn(() => Promise.resolve({ data: { videoId: null } })) },
}));

function renderBlocks(content) {
  return render(
    <Provider>
      <LessonRenderer content={content} />
    </Provider>,
  );
}

describe('LessonRenderer', () => {
  it('renders every block type in the shared contract', async () => {
    renderBlocks([
      { type: 'heading', text: 'A Heading', level: 2 },
      { type: 'paragraph', text: 'Some prose with **bold** and `code`.' },
      { type: 'code', language: 'javascript', text: 'const answer = 42;' },
      { type: 'video', query: 'a search query' },
      {
        type: 'mcq',
        question: 'Is this a question?',
        options: ['No', 'Yes'],
        answer: 1,
        explanation: 'It ends in a question mark.',
      },
    ]);

    expect(screen.getByRole('heading', { name: 'A Heading' })).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByText('code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    // Matched loosely: MCQs render with a "1. " position prefix in the same element.
    expect(screen.getByText(/Is this a question\?/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /search on youtube/i })).toBeInTheDocument();

    // Guards against a block type being added to the contract but not the registry.
    expect(ALL_BLOCK_TYPES).toHaveLength(5);
  });

  it('skips unknown block types instead of throwing', () => {
    renderBlocks([
      { type: 'paragraph', text: 'before' },
      { type: 'some-future-block', payload: { anything: true } },
      { type: 'paragraph', text: 'after' },
    ]);

    // The surrounding lesson still renders — a newer backend cannot break an older client.
    expect(screen.getByText('before')).toBeInTheDocument();
    expect(screen.getByText('after')).toBeInTheDocument();
  });

  it('tolerates malformed entries in the content array', () => {
    renderBlocks([null, undefined, 'a bare string', 42, { type: 'paragraph', text: 'survives' }]);
    expect(screen.getByText('survives')).toBeInTheDocument();
  });

  it('renders nothing for empty or missing content', () => {
    // Rendered without the theme Provider, which injects its own colour-mode <script>
    // into the container and would defeat an emptiness assertion.
    for (const content of [[], null, undefined]) {
      const { container, unmount } = render(<LessonRenderer content={content} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('numbers MCQs sequentially, ignoring prose blocks between them', () => {
    renderBlocks([
      { type: 'mcq', question: 'First?', options: ['a', 'b'], answer: 0, explanation: '' },
      { type: 'paragraph', text: 'interlude' },
      { type: 'mcq', question: 'Second?', options: ['a', 'b'], answer: 0, explanation: '' },
    ]);

    expect(screen.getByText(/^1\./)).toBeInTheDocument();
    expect(screen.getByText(/^2\./)).toBeInTheDocument();
  });
});

describe('MCQBlock interaction', () => {
  it('reveals the explanation and marks the correct answer once answered', async () => {
    const user = userEvent.setup();

    renderBlocks([
      {
        type: 'mcq',
        question: 'Which hook replaces this.state?',
        options: ['useEffect', 'useState'],
        answer: 1,
        explanation: 'useState returns the value and a setter.',
      },
    ]);

    expect(screen.queryByText(/returns the value and a setter/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /useEffect/ }));

    expect(screen.getByText('Not quite')).toBeInTheDocument();
    expect(screen.getByText(/returns the value and a setter/)).toBeInTheDocument();
  });

  it('reports a correct choice as correct', async () => {
    const user = userEvent.setup();

    renderBlocks([
      {
        type: 'mcq',
        question: 'Pick the right one',
        options: ['wrong', 'right'],
        answer: 1,
        explanation: 'Because it is.',
      },
    ]);

    await user.click(screen.getByRole('radio', { name: /right/ }));
    expect(screen.getByText('Correct')).toBeInTheDocument();
  });
});
