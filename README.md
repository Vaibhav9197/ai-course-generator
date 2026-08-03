# Text-to-Learn — AI-Powered Course Generator

Turn any topic prompt into a structured, multi-module online course: 3–6 modules of 3–5
lessons each, with objectives, rich lesson content (text, code, video, quizzes), Hinglish
audio narration, and PDF export.

> Built against the brief in [`Hackathon Roadmap.pdf`](./Hackathon%20Roadmap.pdf).

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite + Chakra UI v3 (Vercel) |
| Backend | Node + Express + Mongoose (Render) |
| Database | MongoDB Atlas |
| AI | Google Gemini (`@google/genai`) — generation, translation, TTS |
| Video | YouTube Data API v3 |
| Auth | Auth0 (OAuth 2.0 / RS256 JWT) |

## Layout

```
project-root/
├─ client/     React frontend      → deployed to Vercel  (root dir: client)
├─ server/     Express API         → deployed to Render   (root dir: server)
├─ shared/     contentBlocks.js — the block-type contract used by both
└─ .github/    CI workflows
```

There are deliberately **no npm workspaces**: Render and Vercel each build from a
subdirectory, and workspace hoisting makes those builds fragile. The root `package.json`
exists only to run both sides locally.

## Quick start

```bash
npm run install:all           # root + server + client

cp server/.env.example server/.env
cp client/.env.example client/.env
#   fill in server/.env — at minimum MONGO_URI and GEMINI_API_KEY

npm run dev                   # server on :5000, client on :5173
```

The app runs before you have any credentials: missing services are reported as
"not configured" on the landing page instead of crashing. In development the client
reaches the API through Vite's `/api` proxy, so `VITE_API_URL` can stay empty.

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Both servers with live reload |
| `npm run lint` | ESLint across client + server |
| `npm test` | Vitest across client + server |
| `npm run seed` | Insert a fixture course (no Gemini tokens spent) |

## Architecture

Full design notes — including the two-stage lazy generation model, the content-block
contract, and the API surface — are in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Environment variables

Documented inline in [`server/.env.example`](./server/.env.example) and
[`client/.env.example`](./client/.env.example).

Every `VITE_*` value is inlined into the public JavaScript bundle. API keys (Gemini,
YouTube) live in `server/.env` **only** and are never exposed to the browser.
