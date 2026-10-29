import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Provider from './Provider.jsx';
import ResourceList from './ResourceList.jsx';

const RESOURCES = [
  { title: 'React docs: Rules of Hooks', kind: 'documentation', query: 'react.dev rules of hooks' },
  { title: 'eslint-plugin-react-hooks', kind: 'tool', query: 'eslint-plugin-react-hooks npm' },
];

function renderList(resources) {
  return render(
    <Provider>
      <ResourceList resources={resources} />
    </Provider>,
  );
}

describe('ResourceList', () => {
  it('lists each source under a "Further reading" heading', () => {
    renderList(RESOURCES);

    expect(screen.getByRole('heading', { name: 'Further reading' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Docs')).toBeInTheDocument();
    expect(screen.getByText('Tool')).toBeInTheDocument();
  });

  it('links to a web search for the query, never to a model-supplied URL', () => {
    renderList(RESOURCES);

    const link = screen.getByRole('link', { name: /React docs: Rules of Hooks/ });
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/search?q=react.dev%20rules%20of%20hooks',
    );
  });

  it('opens links in a new tab without giving the target page a handle on this one', () => {
    renderList(RESOURCES);

    const link = screen.getByRole('link', { name: /eslint-plugin-react-hooks/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('falls back to the default label for an unknown kind', () => {
    renderList([{ title: 'Something', kind: 'podcast', query: 'something' }]);
    expect(screen.getByText('Article')).toBeInTheDocument();
  });

  it('renders nothing for a lesson without resources', () => {
    const { container } = renderList([]);
    expect(container.querySelector('section')).toBeNull();

    renderList(undefined);
    expect(screen.queryByText('Further reading')).not.toBeInTheDocument();
  });
});
