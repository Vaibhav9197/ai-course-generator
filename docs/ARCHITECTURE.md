# Architecture

## The decision that shapes everything: two-stage lazy generation

A 6-module × 5-lesson course with full rich content is roughly 20–30k output tokens.
Generating it in one call means a 60–120s spinner, a high chance of truncated JSON, and a
wasted call whenever the user doesn't like the outline. So generation is split in two:

| Stage | Trigger | Prompt | Output | Latency |
|---|---|---|---|---|
| **1. Outline** | User submits a topic | `generateCoursePrompt(topic)` | Course + module titles + lesson titles only | ~5–10s |
| **2. Enrich** | User opens a lesson | `generateLessonPrompt(course, module, lesson)` | One lesson's objectives + content blocks | ~10–20s |

Stage 1 persists the whole tree immediately with lessons as stubs (`content: []`,
`isEnriched: false`). Stage 2 fills a single lesson on first view and persists the result,
so each lesson is generated **exactly once, ever**. Re-opening a lesson costs zero tokens.

This keeps every HTTP request short, makes failure recoverable at lesson granularity
(one bad lesson doesn't lose the course), and avoids paying for content nobody reads.

## System diagram

```
┌──────────────────────────────┐        ┌─────────────────────────────┐
│  client/  (Vercel)           │        │  Auth0 tenant               │
│  Vite + React + Chakra v3    │◀──────▶│  SPA app + API audience     │
│                              │ OAuth2 │  issues RS256 JWT           │
│  Auth0Provider               │        └─────────────────────────────┘
│  axios + Bearer interceptor  │                     ▲ JWKS
└──────────────┬───────────────┘                     │
               │ HTTPS  /api/*                       │
               ▼                                     │
┌──────────────────────────────────────────────────┐ │
│  server/  (Render)  Node + Express                │─┘
│                                                   │
│  routes → middlewares(jwt, owner, validate,       │
│           rateLimit) → controllers → services     │
│                                                   │
│   services/                                       │
│    ├ gemini.service.js  ──────▶ Gemini API        │
│    │   (outline · lesson · translate · TTS)       │
│    ├ youtube.service.js ──────▶ YouTube Data v3   │
│    ├ aiJson.service.js   (parse→repair→validate)  │
│    └ wav.service.js      (PCM → WAV buffer)       │
└──────────────┬────────────────────────────────────┘
               │ Mongoose
               ▼
   ┌───────────────────────────────────────────┐
   │  MongoDB Atlas                            │
   │  users · courses · modules · lessons      │
   │  videocaches                              │
   └───────────────────────────────────────────┘
```

## The content-block contract

[`shared/contentBlocks.js`](../shared/contentBlocks.js) defines one block union that serves
as the Gemini `responseSchema`, the runtime validator, the shape stored in `Lesson.content`,
and the key into the React block registry.

```js
{ type: 'heading',   text, level? }
{ type: 'paragraph', text }              // inline markdown: **bold**, `code`
{ type: 'code',      language, text }
{ type: 'video',     query }             // a SEARCH QUERY, never a URL
{ type: 'mcq',       question, options[], answer, explanation }
```

Two rules prevent whole classes of bugs:

1. **Video blocks carry a search query, not a URL.** Model-invented YouTube URLs are
   almost always dead links, so resolution happens server-side against the YouTube API.
2. **Unknown block types render as `null`, never throw.** New block types can ship
   backend-first without breaking already-deployed clients.

## Data model

Array order in `Course.modules` and `Module.lessons` is the canonical ordering, because the
frontend route is index-based (`/courses/:courseId/module/:moduleIndex/lesson/:lessonIndex`).

| Collection | Key fields | Indexes |
|---|---|---|
| `User` | `auth0Sub` (unique), `email`, `name`, `prefs` | `auth0Sub` |
| `Course` | `title`, `description`, `creator` (Auth0 `sub`), `topicPrompt`, `tags[]`, `modules[ref]`, `status` | `creator + createdAt` |
| `Module` | `title`, `course` (ref), `lessons[ref]` | `course` |
| `Lesson` | `title`, `objectives[]`, `content[]`, `isEnriched`, `enrichError`, `module` (ref), `translations.hinglish` | `module` |
| `VideoCache` | `queryKey` (normalised, unique), `videoId`, `title` | `queryKey` |

## API surface

Everything except `/api/health` requires a valid Auth0 bearer token. Course-scoped routes
run an `ownsCourse` middleware that matches `Course.creator` against the JWT `sub` and
returns **404 on mismatch — never 403**, so course IDs cannot be enumerated.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Public. Also pre-warms Render's cold start. |
| POST | `/api/courses/generate` | Outline generation. Rate-limited + idempotency-locked. |
| GET | `/api/courses` | Current user's courses. |
| GET | `/api/courses/:courseId` | Populated tree, titles only. |
| DELETE | `/api/courses/:courseId` | Cascades to modules + lessons. |
| GET | `/api/courses/:courseId/module/:mi/lesson/:li` | Enriches on demand if not yet enriched. |
| POST | `/api/lessons/:lessonId/regenerate` | Force re-enrich. |
| GET | `/api/youtube/search?query=` | Cache-first videoId lookup. |
| POST | `/api/lessons/:lessonId/translate` | Hinglish text, cached on the lesson. |
| POST | `/api/lessons/:lessonId/audio` | `audio/wav` stream, not persisted. |
| PATCH | `/api/me` | Update preferences. |

## Notable engineering constraints

**Gemini model IDs are env-driven, never hardcoded.** Identifiers churn quickly and all TTS
models are still preview-tagged. Confirm current values at
<https://ai.google.dev/gemini-api/docs/models>.

**AI JSON is hardened in layers.** `responseMimeType: 'application/json'` plus a
`responseSchema` makes markdown-fenced output structurally impossible, but the model can
still return valid JSON with the wrong *shape* (8 modules, a 5-option MCQ, an out-of-range
answer index). So `aiJson.service.js` runs parse → validate (Zod) → one repair-retry with
the error fed back → normalise (clamp counts, drop malformed blocks) → fail loudly.

**YouTube quota is the binding constraint.** The Data API grants 10,000 units/day and
`search.list` costs 100 units — about 100 searches per day total. A single 30-lesson course
could exhaust it, so every lookup is cache-first on a normalised query key, and quota
exhaustion degrades to a "Search on YouTube" link rather than an error.

**Audio is streamed, not stored.** Gemini TTS returns raw PCM (24 kHz, 16-bit, mono) which
`wav.service.js` wraps in a 44-byte RIFF header. The *translated text* is cached on the
lesson because it is small and the expensive part to get right; multi-MB audio blobs would
strain Mongo's 16 MB document limit and force GridFS for a once-per-lesson feature.

**PDF export renders from a hidden tree.** `LessonPDFExporter` holds a ref to an off-screen
794px-wide (A4 at 96dpi) always-light copy of the lesson, so output is identical regardless
of the active colour mode. Note that `html2canvas` cannot parse `oklch()`/`lab()` colours,
which Chakra v3 tokens can emit — the PDF tree therefore uses plain hex/rgb inline styles
and does not reuse live Chakra-styled components.

**Auth identity comes from the JWT, not `/userinfo`.** Calling Auth0's `/userinfo` per
request would add a network hop and hit rate limits; the verified `sub` claim is
authoritative and `/userinfo` is called once, at first-login user upsert.

## Deliberate deviations from the brief

| Brief says | Implementation | Why |
|---|---|---|
| `VITE_YOUTUBE_API_KEY` in frontend env | Key server-side only, proxied via `/api/youtube/search` | `VITE_*` vars are inlined into the public bundle — that publishes the key |
| Backend fetches Auth0 `/userinfo` per request | Identity from verified JWT `sub`; `/userinfo` once at upsert | Removes a per-request hop and rate-limit exposure |
| Two separate repositories | One repo, `client/` + `server/`, two deploy roots | Matches the brief's own final folder structure; allows atomic cross-stack commits |
| (implied) generate the whole course up front | Two-stage: outline now, lessons on first open | Avoids long waits, truncated JSON, and wasted tokens |
| Return a `.wav` buffer for narration | Same, but only translated **text** is cached | Multi-MB PCM per lesson would force GridFS |
