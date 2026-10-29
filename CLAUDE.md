# CLAUDE.md

Guidance for AI coding agents working in this repository. Read this first; the human-facing
docs in `docs/` go deeper.

## What this is

**Text-to-Learn**: a topic prompt becomes a structured online course. Gemini generates a
course outline (3–6 modules × 3–5 lessons); each lesson body (objectives, prose, code, a
YouTube video, 4–5 MCQs) is generated the first time it is opened and cached forever.
Lessons can be narrated in Hinglish (Gemini translate + TTS) and exported as PDF.

- `client/` — React 19, Vite 8, Chakra UI v3, React Router 7, axios → Vercel
- `server/` — Node 22, Express 4, Mongoose 8, Zod, `@google/genai` → Render
- `shared/contentBlocks.js` — the lesson block contract imported by BOTH sides
- `docs/` — `ARCHITECTURE.md` (design rationale), `API.md`, `DEPLOYMENT.md`, `DEMO_SCRIPT.md`

A longer narrative walkthrough (request traces, design decisions, interview Q&A) is the
private artifact https://claude.ai/artifact/TtdzYRdkaUfjay7uVJ5W9V — read it with the
Artifact tool (`action: "read"`) if this file isn't enough. This file is authoritative for
agents; update it when the code changes.

No npm workspaces, on purpose: Render and Vercel each build one side. Each package has its
own `node_modules` and lockfile.

## Commands

Run from the repo root unless noted.

```bash
npm run install:all     # root + server + client
npm run dev             # API :5000 and client :5173 (Vite proxies /api → :5000)
npm test                # server (171 tests) then client (30 tests)
npm run lint            # ESLint in both packages
npm run seed            # insert fixture course, no Gemini tokens (-- --force to replace)

cd server && npx vitest run tests/aiJson.test.js   # one server test file
cd client && npx vitest run src/utils/pdf.test.js  # one client test file
cd client && npm run build                         # must succeed with no VITE_* vars set
```

The app runs with zero credentials: missing services report "not configured" via
`GET /api/health`, and without Auth0 every request is attributed to the seed user.
Real content needs `MONGO_URI` and `GEMINI_API_KEY` in `server/.env`.

Code style: ESM everywhere, Prettier (`singleQuote`, `semi`, `printWidth: 100`,
`trailingComma: all`). Comments explain *why*, as JSDoc blocks above functions — match that
density when editing.

## Server architecture

Request path: `app.js` (helmet, compression, CORS, JSON 1 MB) → `routes/*` →
`requireAuth` → rate limiter → `controllers/*` (thin) → `services/*` (logic) →
`models/*` / external APIs → `middlewares/errorHandler.js`.

`app.js` exports `createApp()` with no port/DB side effects (used by Supertest);
`server.js` does bootstrap and graceful shutdown. Config is centralised in `config/env.js`.

| File | Responsibility |
|---|---|
| `controllers/generate.controller.js` | `POST /courses/generate` (stage 1), `GET …/module/:mi/lesson/:li` (stage 2, generates on first view), regenerate |
| `controllers/narration.controller.js` | `/lessons/:id/translate` (cached text), `/lessons/:id/audio` (streamed WAV, never stored) |
| `services/gemini.service.js` | All Gemini calls; `generateValidated` = generate → parse → validate → one repair retry (temp 0.2) → 502 |
| `services/aiJson.service.js` | Pure, no I/O: `parseJsonLoose`, `validateOutline`, `validateLesson` (Zod + semantic checks + clamping) |
| `services/geminiSchemas.js` | Gemini `responseSchema` objects built from the shared contract |
| `services/prompts/*` | Course, lesson, repair, translate and TTS-directive prompts |
| `services/enrich.service.js` | Lesson enrichment, wrapped in `runOnce`, records `enrichError` on failure |
| `services/courseTree.service.js` | Create / load / delete the Course › Module › Lesson tree; `buildLessonContext` (prev/next across modules) |
| `services/youtube.service.js` | Cache-first video lookup with quota-aware caching rules |
| `services/wav.service.js` | Wraps Gemini's headerless PCM in a 44-byte RIFF header |
| `utils/inFlight.js` | `runOnce(key, fn)`: merges concurrent identical work (per-process Map) |
| `utils/ApiError.js` | `ApiError` factories + `asyncHandler` |

Models: `User` (`auth0Sub` unique), `Course` (`creator` = Auth0 `sub`, ordered `modules[]`),
`Module` (ordered `lessons[]`), `Lesson` (`content[]` Mixed, `resources[]`, `isEnriched`,
`enrichError`, `translations.hinglish`), `VideoCache` (`queryKey` unique, `videoId` nullable).

## Client architecture

`main.jsx`: `AuthProvider` › Chakra `Provider` › `BrowserRouter` › `AuthTokenBridge` + routes;
calls `warmUpBackend()` to wake Render's cold start.

- `utils/api.js` — the single axios instance. Request interceptor adds the Auth0 bearer
  token (registered by `components/AuthTokenBridge.jsx`); response interceptor normalises
  every failure into `ApiClientError` with a user-readable message.
- `hooks/useAuth.js` — wraps Auth0; returns a fake signed-in user when Auth0 is unconfigured.
  Components must use this, never `useAuth0` directly.
- `hooks/useApi.js` — `useFetch(url)` with AbortController. No React Query by design.
- `routes.jsx` — `/`, `/courses/:courseId`, `/courses/:courseId/module/:moduleIndex/lesson/:lessonIndex`, `/callback` (outside the layout).
- `components/blocks/index.js` — block registry; `LessonRenderer` maps `content[]` through it.
- `components/HinglishPlayer.jsx` — fetches audio as a blob (an `<audio src>` cannot send a bearer token).
- `components/LessonPDFExporter.jsx` + `PdfLessonSheet.jsx` + `utils/pdf.js` — off-screen print tree rasterised with dynamically imported `html2canvas-pro` + `jspdf`.

## Invariants — do not break these

1. **The block contract is shared.** Adding or changing a block type in
   `shared/contentBlocks.js` means updating, together: `server/services/geminiSchemas.js`,
   the Zod schemas + `normalizeBlock` in `aiJson.service.js`, the lesson prompt,
   `blocksToPlainText`, `client/src/components/blocks/index.js` (+ a component), and
   `client/src/components/PdfLessonSheet.jsx` (which switches on string literals).
2. **Unknown block types render as `null`, never throw** (`getBlockComponent`).
3. **Video blocks and lesson `resources` carry a search `query`, never a URL.** Videos are
   resolved server-side; resources render as web-search links (`resourceSearchUrl`).
   Resources are a lesson-level field beside `objectives`, not a block: they stay out of
   narration, quiz numbering and the block registry, and a bad list never fails a lesson.
4. **Ownership.** Every course read/write filters by `creator: currentUserSub(req)`.
   Lesson-id routes walk lesson → module → course to check ownership. Mismatch → **404,
   never 403**. Identity comes only from the verified JWT `sub`, never from the `User` row.
5. **Array order is canonical.** `Course.modules` / `Module.lessons` order is the course
   order because routes are index-based. Don't sort or reorder them.
6. **AI output is never persisted unvalidated.** All JSON generation goes through
   `generateValidated` with a validator from `aiJson.service.js`. Keep `aiJson.service.js`
   pure (no network, no DB) so it stays cheap to test.
7. **No secrets in `VITE_*` variables** — they are inlined into the public bundle. Gemini and
   YouTube keys live only in `server/.env`; the browser goes through the API.
8. **Gemini model IDs come from env** (`GEMINI_TEXT_MODEL`, `GEMINI_TTS_MODEL`), never hardcoded.
9. **Audio is never stored**; only the Hinglish *text* is cached on the lesson.
10. **YouTube caching rules:** cache hits and `no_results`; never cache `quota_exceeded`,
    network/5xx failures, or `not_configured`. `/api/youtube/search` always returns 200.
11. **Unicode:** slug/key regexes keep `\p{M}` alongside `\p{L}\p{N}` (Devanagari vowel signs).
12. **Dev auth fallback** (seed user when Auth0 is unset) must stay disabled when
    `NODE_ENV=production`.
13. Register Mongoose models via `registerModel` (avoids `OverwriteModelError` under
    `node --watch` and `vi.resetModules()`).
14. Error responses use the envelope `{ error: { message, code?, details? } }` via `ApiError`
    + the central handler; don't send ad-hoc error JSON.
15. Never spread a Mongoose document into a response — whitelist fields (see `publicUser`
    in `user.controller.js`).
16. **TTS input is the narration text alone.** Current Gemini TTS models speak any leading
    style instruction aloud. TTS output may be raw PCM or a full WAV depending on the model:
    always go through `toWav()` (wav.service.js), never `pcmToWav()` directly.
17. **Every Gemini call carries an `httpOptions.timeout`** (`TEXT_TIMEOUT_MS` 30 s,
    `SPEECH_TIMEOUT_MS` 60 s in gemini.service.js); timeouts and Google's own
    `504 Deadline expired` map to 504 (`code: ai_timeout`), `503 high demand` and
    `500 INTERNAL` map to a readable 503 (`code: ai_busy`), and `generateValidated` resends
    either once. Free-tier
    calls intermittently stall or get rejected under load, so this is load-bearing. Keep
    2 × text timeout under the client's 120 s axios timeout.
18. **Lessons are validated with `minQuestions: 4`.** Too few valid MCQs fails validation and
    triggers the repair prompt; the validator returns the cleaned lesson as a scored
    `fallback`, and `generateValidated` returns the best fallback rather than erroring. At
    most two Gemini calls per lesson, ever.

## Gemini models and quotas

Defaults are `gemini-3.5-flash-lite` (text) and `gemini-3.8-flash-lite-tts` (speech).
`gemini-2.5-*` returns "no longer available to new users" for new keys. On the free tier
Flash-Lite has far more requests/day than Flash (one course = 1 outline + 1 call per opened
lesson), and TTS quotas are tiny (a few per minute, ~10/day): don't burn them in ad-hoc
testing. List what a key can use with `ai.models.list()`.

## Testing

- Server tests use `mongodb-memory-server` (`server/tests/helpers/memoryDb.js`); first run
  downloads a large MongoDB binary, hence the long `hookTimeout`.
- `config/env.js` skips `dotenv` when `NODE_ENV=test`, so tests never read a developer's real
  `server/.env` keys. Don't undo that.
- Gemini is replaced via `__setClientForTests` in `gemini.service.js` or module mocks;
  YouTube by stubbing `fetch`. Rate limiters are skipped when `NODE_ENV=test`
  (`rateLimit.test.js` covers them separately).
- Client tests: Vitest + jsdom + Testing Library. `client/vitest.config.js` must keep the
  React plugin, or JSX fails with "React is not defined".
- Not automated: PDF rasterisation and the Auth0 redirect flow (manual checklist in
  `docs/DEMO_SCRIPT.md`).
- CI (`.github/workflows/ci.yml`): server lint + test; client lint + test + build.

## Deployment

- Render builds `server/` from `render.yaml` (health check `/api/health`; secrets `sync: false`).
- Vercel builds from the **repo root** via `vercel.json` (building from `client/` would drop
  `shared/` from the build context). SPA rewrite to `index.html`.
- CORS allows `CLIENT_ORIGIN` (comma-separated) plus any `https://*.vercel.app`.
- `runOnce` and rate-limit counters are in-memory: correct only for a single instance.

## Known issues (verified by reading the code, not yet fixed)

- **`docs/API.md` is wrong about lesson failure:** it says the lesson is returned with
  `enrichError`; the code returns 502 and persists `enrichError` (asserted in
  `tests/generate.routes.test.js`).
- **Course creation isn't atomic:** `createCourseTree` does sequential inserts; a crash
  mid-way leaves orphans. `Course.status` values `generating`/`failed` are never set.
- **Unused code:** `optionalAuth` (auth.js), `resolveLessonByIndex` (duplicated inline in
  `getOrEnrichLesson`), `User.generationCount` / `lastGeneratedAt`.
- **Probably lost post-login return path:** `onRedirectCallback` uses
  `history.replaceState`, then `pages/Callback.jsx` navigates to `/`. Unverified in a browser.
- Auth0 tokens are cached in `localStorage` (needed for Safari/Brave); nothing renders raw
  HTML, which keeps the XSS surface small — keep it that way.
