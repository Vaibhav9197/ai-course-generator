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
| GET | `/api/health` | Public. Reports which services are configured; also pre-warms Render's cold start. |
| POST | `/api/courses/generate` | Outline generation. Rate-limited + idempotency-locked. |
| GET | `/api/courses` | Current user's courses. |
| GET | `/api/courses/:courseId` | Populated tree, titles only. |
| DELETE | `/api/courses/:courseId` | Cascades to modules + lessons. |
| GET | `/api/courses/:courseId/module/:mi/lesson/:li` | Generates the body on first view. |
| POST | `/api/lessons/:lessonId/regenerate` | Force regeneration. |
| POST | `/api/lessons/:lessonId/translate` | Hinglish text, cached on the lesson. |
| POST | `/api/lessons/:lessonId/audio` | `audio/wav` stream, not persisted. |
| GET | `/api/youtube/search?query=` | Cache-first videoId lookup. Always 200. |
| GET · PATCH | `/api/me` | Profile upsert and preferences. |

Full request/response detail is in [API.md](./API.md).

**Development without credentials.** When Auth0 is unconfigured and `NODE_ENV` is not
`production`, `requireAuth` attributes requests to a fixed local development user, so the
whole application is usable before any tenant exists. The fallback is hard-disabled in
production — a public URL must never reach it.

## Notable engineering constraints

**Gemini model IDs are env-driven, never hardcoded.** Identifiers churn quickly and older
models are withdrawn for new API keys, which is exactly what happened to `gemini-2.5-flash`.
Confirm current values at <https://ai.google.dev/gemini-api/docs/models>.

**TTS output format varies by model.** Older TTS models return headerless PCM
(`audio/L16;rate=24000`); current ones return a complete WAV. `toWav` in `wav.service.js`
wraps the first and passes the second through. Current models also speak any style
instruction placed before the text, so the narration text is sent on its own.

**Every Gemini call has a time limit** (45 s for text, 60 s for speech) via an `AbortSignal`,
mapped to a 504. Without it a stalled call hangs until the browser gives up.

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

**PDF export renders from a separate print tree.** `PdfLessonSheet` is an independent
component using plain inline hex colours and no Chakra at all, rendered off-screen at 794px
(A4 at 96dpi) and captured by ref. It is not a rasterisation of the live lesson, which buys
three things: output identical in light and dark mode; no dependency on CSS custom
properties or modern colour functions (`oklch`/`lab`/`color-mix`), which canvas rasterisers
fail on; and line breaks decided by the sheet rather than the browser window.

`html2canvas-pro` rather than `html2canvas`: the original is unmaintained at 1.4.1 and
throws on those colour functions. The current build emits none, but one Chakra update would
be enough. Both it and `jspdf` are dynamically imported — ~650kB combined, and most visits
never export anything.

The element is hidden by being positioned off-screen at zero opacity, **not** `display:none`
or `visibility:hidden`: both collapse layout, and an element with no geometry captures as
blank. `aria-hidden` plus `inert` keep it out of the accessibility tree and tab order.

**Auth identity comes from the JWT, not `/userinfo`.** Calling Auth0's `/userinfo` per
request would add a network hop and hit rate limits; the verified `sub` claim is
authoritative and `/userinfo` is called once, at first-login user upsert.

## Deliberate deviations from the brief

| Brief says | Implementation | Why |
|---|---|---|
| `VITE_YOUTUBE_API_KEY` in frontend env | Key server-side only, proxied via `/api/youtube/search` | `VITE_*` vars are inlined into the public bundle — that publishes the key |
| Backend fetches Auth0 `/userinfo` per request | Identity from verified JWT `sub`; `/userinfo` once at upsert | Removes a per-request hop and rate-limit exposure |
| Two separate repositories | One repo, `client/` + `server/`, two deploy targets | Matches the brief's own final folder structure; allows atomic cross-stack commits |
| (implied) generate the whole course up front | Two-stage: outline now, lessons on first open | Avoids long waits, truncated JSON, and wasted tokens |
| Return a `.wav` buffer for narration | Same, but only translated **text** is cached | Multi-MB PCM per lesson would force GridFS |
| `html2canvas` | `html2canvas-pro` (drop-in fork) | The original is unmaintained and throws on `oklch`/`lab`/`color-mix` |
| Vercel Root Directory = `client` | Vercel builds from the repository root | Building from `client/` puts sibling `shared/` outside the build context |

## Operational notes

**Cost control.** Generation endpoints are paid AI calls behind a public URL.
`express-rate-limit` is keyed on the JWT `sub` rather than IP — IP is both too coarse
(shared NAT) and too easy to rotate — with a tighter ceiling on narration, which is two
calls and billed per character. `runOnce` de-duplicates identical concurrent work, so a
double-clicked button or two open tabs pay once. The in-flight map is per-process, which
suits a single Render instance; a multi-instance deployment would need a Mongo or Redis
lock.

**Idempotent model registration.** `registerModel` reuses an already-compiled Mongoose
model instead of throwing `OverwriteModelError`, which happens whenever the module graph is
re-evaluated without a process restart — under `node --watch` in development and
`vi.resetModules()` in tests.

**Unicode.** Slug and cache-key normalisation keeps `\p{M}` (combining marks) alongside
letters and digits. Devanagari vowel signs are marks, so a letters-only filter reduces
"हिंदी" to "हद" — which mangles filenames and, worse, collapses distinct Hindi video queries
onto one cache key. This matters directly given the Hinglish feature.
