/**
 * A hand-written fixture course.
 *
 * Purpose: unblock all frontend rendering work and all route tests without spending a
 * single Gemini token, and act as the reference example of a well-formed outline +
 * enriched lesson. `enrichedLessons` deliberately exercises every block type in
 * shared/contentBlocks.js.
 */

export const sampleOutline = {
  title: 'Introduction to React Hooks',
  description:
    'Learn how React Hooks let you use state and lifecycle features in function ' +
    'components, progressing from the fundamentals to custom hooks and performance tuning.',
  tags: ['react', 'javascript', 'frontend', 'hooks'],
  modules: [
    {
      title: 'Hook Fundamentals',
      summary: 'Why hooks exist and the rules that govern them.',
      lessons: [
        'Why Hooks Replaced Class Components',
        'The Rules of Hooks',
        'Managing State with useState',
      ],
    },
    {
      title: 'Side Effects and Refs',
      summary: 'Synchronising components with the world outside React.',
      lessons: [
        'Running Side Effects with useEffect',
        'Cleaning Up Effects',
        'Reaching the DOM with useRef',
      ],
    },
    {
      title: 'Custom and Advanced Hooks',
      summary: 'Composing your own hooks and avoiding needless re-renders.',
      lessons: [
        'Writing Your First Custom Hook',
        'Sharing State with useContext',
        'Memoising with useMemo and useCallback',
      ],
    },
  ],
};

/**
 * Fully enriched content for two lessons, keyed by lesson title.
 *
 * Only two are enriched on purpose: the seeded course then contains both enriched and
 * un-enriched lessons, so the UI's "generating…" path is exercised too.
 */
export const enrichedLessons = {
  'Why Hooks Replaced Class Components': {
    objectives: [
      'Explain the two problems with class components that hooks were designed to solve.',
      'Identify which class lifecycle methods map onto which hooks.',
      'Recognise when a function component is the better default.',
    ],
    content: [
      { type: 'heading', text: 'The problem with classes', level: 2 },
      {
        type: 'paragraph',
        text:
          'Before hooks, any component that needed state or lifecycle methods had to be a ' +
          '**class component**. That worked, but it created two persistent problems: logic ' +
          'that belonged together got split across `componentDidMount` and ' +
          '`componentDidUpdate`, and there was no clean way to reuse stateful logic between ' +
          'components without wrapper hierarchies.',
      },
      {
        type: 'paragraph',
        text:
          'Higher-order components and render props both tried to solve reuse, and both ' +
          'produced deeply nested trees that were hard to read and hard to debug — the ' +
          'pattern the community called "wrapper hell".',
      },
      { type: 'heading', text: 'The same component, twice', level: 2 },
      {
        type: 'paragraph',
        text: 'Here is a counter written the old way, as a class:',
      },
      {
        type: 'code',
        language: 'jsx',
        text: `class Counter extends React.Component {
  constructor(props) {
    super(props);
    this.state = { count: 0 };
  }

  componentDidMount() {
    document.title = \`Count: \${this.state.count}\`;
  }

  componentDidUpdate() {
    document.title = \`Count: \${this.state.count}\`;
  }

  render() {
    return (
      <button onClick={() => this.setState({ count: this.state.count + 1 })}>
        {this.state.count}
      </button>
    );
  }
}`,
      },
      {
        type: 'paragraph',
        text:
          'Note that the `document.title` logic has to be written twice. With hooks, the ' +
          'same behaviour is one declaration that describes the *intent* rather than the ' +
          'lifecycle timing:',
      },
      {
        type: 'code',
        language: 'jsx',
        text: `function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = \`Count: \${count}\`;
  }, [count]);

  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`,
      },
      {
        type: 'paragraph',
        text:
          'The class version answers "when should this run?". The hook version answers ' +
          '"what should always be true?" — and React works out the timing.',
      },
      { type: 'video', query: 'React hooks vs class components explained' },
      { type: 'heading', text: 'Check your understanding', level: 2 },
      {
        type: 'mcq',
        question: 'Which problem were hooks primarily designed to solve?',
        options: [
          'Making React render faster',
          'Reusing stateful logic without wrapper components',
          'Removing the need for a build step',
          'Replacing JSX with plain JavaScript',
        ],
        answer: 1,
        explanation:
          'Hooks let you extract stateful logic into a plain function that any component ' +
          'can call, which removes the need for higher-order components and render props. ' +
          'Performance was not the motivation.',
      },
      {
        type: 'mcq',
        question: 'In a function component, which hook replaces `this.state`?',
        options: ['useEffect', 'useRef', 'useState', 'useContext'],
        answer: 2,
        explanation:
          '`useState` returns the current value and a setter, which together serve the ' +
          'role `this.state` and `this.setState` played in a class.',
      },
      {
        type: 'mcq',
        question:
          'Which pair of lifecycle methods does a single `useEffect` with a dependency ' +
          'array typically replace?',
        options: [
          'constructor and render',
          'componentDidMount and componentDidUpdate',
          'shouldComponentUpdate and componentDidCatch',
          'getDerivedStateFromProps and render',
        ],
        answer: 1,
        explanation:
          'An effect runs after mount and again whenever a dependency changes, covering ' +
          'both methods — which is why the duplicated logic in the class example disappears.',
      },
      {
        type: 'mcq',
        question: 'Can a class component use hooks?',
        options: [
          'Yes, with a decorator',
          'Yes, but only useState',
          'No — hooks only work inside function components and other hooks',
          'Yes, via this.hooks',
        ],
        answer: 2,
        explanation:
          'Hooks rely on call order within a function component render. Classes have no ' +
          'equivalent hook-call position, so hooks cannot be used inside them.',
      },
    ],
  },

  'The Rules of Hooks': {
    objectives: [
      'State the two rules of hooks and the reason behind them.',
      'Spot a conditional hook call and correct it.',
      'Use the ESLint plugin to catch violations automatically.',
    ],
    content: [
      { type: 'heading', text: 'Two rules, one reason', level: 2 },
      {
        type: 'paragraph',
        text:
          'There are only two rules. **Call hooks at the top level** — never inside a ' +
          'condition, loop, or nested function. And **call hooks only from React function ' +
          'components or other hooks**.',
      },
      {
        type: 'paragraph',
        text:
          'Both rules exist for the same underlying reason: React identifies your hooks by ' +
          'the *order* in which they are called, not by name. There is no key or label — ' +
          'just position. Change the order between renders and React hands back the wrong ' +
          'state.',
      },
      { type: 'heading', text: 'What breaking the rule looks like', level: 2 },
      {
        type: 'code',
        language: 'jsx',
        text: `// Broken: the hook only runs sometimes, so positions shift between renders.
function Profile({ userId }) {
  if (!userId) return <Login />;

  const [user, setUser] = useState(null); // hook #1 on some renders, absent on others
  useEffect(() => { fetchUser(userId).then(setUser); }, [userId]);

  return <UserCard user={user} />;
}`,
      },
      {
        type: 'paragraph',
        text:
          'The fix is to hoist every hook above the early return, so the call sequence is ' +
          'identical on every render:',
      },
      {
        type: 'code',
        language: 'jsx',
        text: `function Profile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!userId) return;
    fetchUser(userId).then(setUser);
  }, [userId]);

  if (!userId) return <Login />;
  return <UserCard user={user} />;
}`,
      },
      {
        type: 'paragraph',
        text:
          'The condition moves *inside* the effect rather than guarding the hook itself. ' +
          'Install `eslint-plugin-react-hooks` and this whole class of bug becomes a lint ' +
          'error instead of a runtime mystery.',
      },
      { type: 'video', query: 'rules of hooks react eslint plugin explained' },
      { type: 'heading', text: 'Check your understanding', level: 2 },
      {
        type: 'mcq',
        question: 'Why must hooks be called in the same order on every render?',
        options: [
          'To keep the bundle small',
          'React matches hooks to their state by call order, not by name',
          'JavaScript requires it',
          'To allow server-side rendering',
        ],
        answer: 1,
        explanation:
          'React stores hook state in a list per component and walks it positionally, so ' +
          'a changed call order returns mismatched state.',
      },
      {
        type: 'mcq',
        question: 'Which of these is a legal place to call a hook?',
        options: [
          'Inside an if statement',
          'Inside a for loop',
          'At the top level of a custom hook',
          'Inside an event handler',
        ],
        answer: 2,
        explanation:
          'Custom hooks are one of the two legal callers. Conditions, loops and event ' +
          'handlers all break the stable-order guarantee.',
      },
      {
        type: 'mcq',
        question: 'How should you handle a hook that is only needed under a condition?',
        options: [
          'Wrap the hook in the condition',
          'Call the hook unconditionally and put the condition inside it',
          'Use a class component instead',
          'Call the hook twice',
        ],
        answer: 1,
        explanation:
          'Keep the hook call unconditional so its position is stable, and branch inside ' +
          'the callback or on the returned value.',
      },
      {
        type: 'mcq',
        question: 'What catches rule-of-hooks violations before runtime?',
        options: [
          'React DevTools',
          'eslint-plugin-react-hooks',
          'The TypeScript compiler',
          'Strict mode alone',
        ],
        answer: 1,
        explanation:
          'The official ESLint plugin statically analyses hook call sites and reports ' +
          'conditional or nested calls as errors.',
      },
    ],
  },
};

/** Auth0-style sub used for seeded data so it is easy to spot and remove. */
export const SEED_CREATOR = 'seed|local-development-user';
