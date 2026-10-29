/**
 * Assembles a single-app upload folder for Embarko.
 *
 * Embarko deploys one folder as one app and installs dependencies only at that folder's
 * root, while this repo is a client + server pair that both import ../shared. So instead of
 * restructuring the repo, this builds a folder shaped the way Embarko expects:
 *
 *   .embarko-build/
 *     package.json        server dependencies only, "start": "node server/server.js"
 *     package-lock.json   pruned to production dependencies (npm 10, as the builder uses)
 *     server/             the API, unchanged
 *     shared/             the block contract, at the same relative path the code imports
 *     public/             the built SPA, which server/app.js serves when present
 *     embarko.json        the Embarko app id, so redeploys reach the same app
 *
 * The SPA is built with an empty VITE_API_URL so it calls the API on its own origin. Auth0
 * values come from the environment or client/.env, and are baked into the public bundle
 * (they are not secrets). Server secrets are never copied: set them as Embarko env vars.
 *
 *   npm run package:embarko
 *   bash <embarko-skill>/scripts/deploy.sh .embarko-build ai-course-generator
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.embarko-build');
const AUTH0_KEYS = ['VITE_AUTH0_DOMAIN', 'VITE_AUTH0_CLIENT_ID', 'VITE_AUTH0_AUDIENCE'];

const run = (command, cwd, env = {}) =>
  execSync(command, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });

/** Reads KEY=value pairs from client/.env without adding a dotenv dependency at the root. */
function readClientEnv() {
  const file = path.join(ROOT, 'client', '.env');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
  );
}

// Without Auth0 the bundle runs in local-dev mode, which the production server refuses,
// so a missing value would only show up as a broken live site. Fail here instead.
const fileEnv = readClientEnv();
const auth0 = Object.fromEntries(AUTH0_KEYS.map((key) => [key, process.env[key] || fileEnv[key] || '']));
const missing = AUTH0_KEYS.filter((key) => !auth0[key]);
if (missing.length) {
  console.error(`Missing ${missing.join(', ')} (set them in client/.env or the environment).`);
  process.exit(1);
}

console.log('==> Building the client for same-origin API calls');
// VITE_API_URL is forced empty: values in process.env take precedence over client/.env.
run('npm run build', path.join(ROOT, 'client'), { ...auth0, VITE_API_URL: '' });

console.log(`==> Assembling ${path.relative(ROOT, OUT)}/`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

const SERVER_SKIP = new Set(['node_modules', 'tests', 'coverage', 'vitest.config.js', 'eslint.config.js']);
fs.cpSync(path.join(ROOT, 'server'), path.join(OUT, 'server'), {
  recursive: true,
  filter: (src) => {
    const name = path.basename(src);
    return !SERVER_SKIP.has(name) && !name.startsWith('.env') && name !== 'package-lock.json' && name !== 'package.json';
  },
});
fs.cpSync(path.join(ROOT, 'shared'), path.join(OUT, 'shared'), { recursive: true });
fs.cpSync(path.join(ROOT, 'client', 'dist'), path.join(OUT, 'public'), {
  recursive: true,
  // Source maps are for local debugging; no need to publish them.
  filter: (src) => !src.endsWith('.map'),
});

const serverPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'package.json'), 'utf8'));
const pkg = {
  name: 'ai-course-generator',
  version: serverPkg.version,
  private: true,
  type: 'module',
  description: 'Text-to-Learn, packaged as one app: Express API plus the built React client.',
  // No "build" script on purpose: the client is already built into public/.
  scripts: { start: 'node server/server.js' },
  dependencies: serverPkg.dependencies,
  engines: serverPkg.engines,
};
fs.writeFileSync(path.join(OUT, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

// Embarko's deploy API asks for the app id to live in embarko.json, so later deploys reach
// this app even if it is renamed. Not a secret: it only identifies the app.
fs.writeFileSync(
  path.join(OUT, 'embarko.json'),
  `${JSON.stringify({ appId: 'cmvts64cb04jc7blwz7k4ufnm' }, null, 2)}\n`,
);

console.log('==> Pruning the lockfile to production dependencies (npm 10)');
// Starting from the server's lock keeps every resolved version identical; npm then drops
// the dev-only entries (vitest, mongodb-memory-server and its ~600 MB binary download).
fs.copyFileSync(path.join(ROOT, 'server', 'package-lock.json'), path.join(OUT, 'package-lock.json'));
run('npx -y npm@10.9.2 install --package-lock-only --no-audit --no-fund', OUT);

console.log(`\nReady: ${OUT}`);
console.log('Next: deploy it with the Embarko skill, e.g.');
console.log('  bash <embarko-skill>/scripts/deploy.sh .embarko-build ai-course-generator');
