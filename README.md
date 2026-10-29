# Text-to-Learn — AI-Powered Course Generator

Turn any topic prompt into a structured, multi-module online course: modules and lessons
with learning objectives, rich content (prose, syntax-highlighted code, embedded video,
interactive quizzes), Hinglish audio narration, and PDF export for offline study.

> Built to the brief in [`Hackathon Roadmap.pdf`](./Hackathon%20Roadmap.pdf).

| | |
|---|---|
| **Live app** | _add your Vercel URL_ |
| **API** | _add your Render URL_ |
| **Architecture** | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| **API reference** | [`docs/API.md`](./docs/API.md) |
| **Deployment guide** | [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) |

---

## What it does

1. You type a topic — "Intro to React Hooks", "Basics of Copyright Law".
2. One AI call designs the syllabus: 3–6 modules of 3–5 lessons, ordered so each builds on
   the last. Saved immediately, in about 5–10 seconds.
3. Opening a lesson for the first time writes it: objectives, explanatory prose, code
   examples where relevant, a suggested video, 4–5 quiz questions with explanations, and
   2–4 suggested readings (real sources, linked as web searches so links never go dead).
   Cached forever after, so it is generated exactly once.
4. Any lesson can be narrated in Hinglish or downloaded as a formatted PDF.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 · Vite 8 · Chakra UI v3 · React Router 7 → **Vercel** |
| Backend | Node 22 · Express · Mongoose → **Render** |
| Database | MongoDB Atlas |
| AI | Google Gemini via `@google/genai` — generation, translation, text-to-speech |
| Video | YouTube Data API v3 |
| Auth | Auth0 (OAuth 2.0, RS256 JWT) |
| Tests | Vitest · Supertest · Testing Library · mongodb-memory-server |

## Repository layout

```
project-root/
├─ client/          React frontend
├─ server/          Express API
├─ shared/          contentBlocks.js — the block-type contract used by BOTH sides
├─ docs/            architecture, API reference, deployment, demo script
├─ .github/         CI workflow
├─ vercel.json      frontend deploy config
└─ render.yaml      backend blueprint
```

There are deliberately **no npm workspaces**. Render and Vercel each build one side, and
workspace hoisting makes those builds fragile. The root `package.json` exists only to run
both locally.

## Quick start

```bash
git clone <your-repo-url> && cd text-to-learn
npm run install:all

cp server/.env.example server/.env
cp client/.env.example client/.env

npm run dev          # API on :5000, app on :5173
```

**The app runs before you have any credentials.** Missing services are reported as "not
configured" rather than crashing, and requests are attributed to a local development user,
so you can explore the UI immediately. To see real content you need two things in
`server/.env`:

| Variable | Where to get it |
|---|---|
| `MONGO_URI` | [MongoDB Atlas](https://cloud.mongodb.com) → free cluster → Connect → Drivers |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |

Optional: `YOUTUBE_API_KEY` (videos fall back to search links without it), and Auth0
values (the app runs as a single local user without them).

```bash
npm run seed         # loads a sample course — no Gemini tokens spent
```

In development the client reaches the API through Vite's `/api` proxy, so `VITE_API_URL`
can stay empty.

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Both servers, with reload |
| `npm run install:all` | Install root + server + client |
| `npm run lint` | ESLint across both packages |
| `npm test` | Vitest across both packages |
| `npm run seed` | Insert the fixture course (`-- --force` to replace) |

## How it works

The full design rationale is in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). The three
decisions that shape everything:

**Two-stage generation.** A full course with rich content is 20–30k output tokens — a
two-minute wait, frequent truncated JSON, and payment for lessons nobody reads. So one call
produces the outline (titles only) and each lesson body is written on first view and cached.
Every request stays short, failure is recoverable per-lesson, and an abandoned course costs
almost nothing.

**One content-block contract.** [`shared/contentBlocks.js`](./shared/contentBlocks.js)
defines a single block union that simultaneously serves as the Gemini response schema, the
runtime validator, the database shape, and the key into the React component registry. Video
blocks carry a *search query*, never a URL, because model-invented links are almost always
dead. Unknown block types render as nothing rather than throwing, so the backend can add a
type without breaking already-deployed clients.

**AI output is treated as hostile.** Schema mode guarantees parseable JSON, not correct
JSON. [`aiJson.service.js`](./server/services/aiJson.service.js) handles every failure mode
observed in real output — markdown fences, surrounding prose, truncation, too many modules,
an MCQ answer index pointing past its own options, a URL where a query was demanded — then
clamps what it can and drops individual malformed blocks rather than discarding a whole
correct lesson. Only if too little survives does it retry, once, with the validation error
fed back to the model.

## Testing

```bash
npm test             # 169 server + 30 client
```

The server suite runs against `mongodb-memory-server`, so it needs no Atlas cluster and no
network. External services (Gemini, YouTube) are stubbed at the module boundary against
their real response shapes.

Weight is concentrated where the risk is:

- **AI JSON hardening** (30 tests) — every known malformed-output case.
- **Generation flow** (18) — that a double-clicked button creates one course, that three
  views of a lesson cost one AI call, that a failure is recorded and clears on retry.
- **Ownership isolation** (12) — 401 unauthenticated, 404-not-403 for another user's
  course, no field leaks, no mass assignment.
- **WAV header** (14) — every field at its exact byte offset.
- **YouTube quota discipline** (13) — which failures cache and which must not.
- **Narration** (14) — that text is cached and audio never is.

Not covered by automated tests: PDF rasterisation and the Auth0 redirect flow, both of
which need a real browser or tenant. See the manual checklist in
[`docs/DEMO_SCRIPT.md`](./docs/DEMO_SCRIPT.md).

## Security notes

- **No API key reaches the browser.** Every `VITE_*` value is inlined into the public
  bundle, so Gemini and YouTube keys live only in `server/.env` and all calls are proxied.
  (The brief suggested `VITE_YOUTUBE_API_KEY`; that would publish the key.)
- **Identity comes from the verified JWT**, never from a database row, and Auth0's
  `/userinfo` is called at most once per user rather than per request.
- **Ownership mismatches return 404, not 403**, so course IDs cannot be enumerated by
  comparing status codes.
- **Generation endpoints are rate-limited per user** (keyed on the JWT `sub`, not IP) and
  de-duplicated in flight, because a public URL in front of a paid API is an open invoice.
- The unauthenticated development fallback is **hard-disabled when `NODE_ENV=production`**.

## Deployment

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md). Summary: Render builds `server/` from
`render.yaml`; Vercel builds from the repository root via `vercel.json` (not from `client/`,
so the shared contract stays in the build context); CI runs lint and tests on every PR.

Render's free tier cold-starts in roughly 50 seconds, so the frontend pings `/api/health`
on load to wake it before the user does anything.
