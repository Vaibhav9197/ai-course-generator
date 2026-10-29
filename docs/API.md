# API reference

Base URL: `http://localhost:5000` in development, your Render URL in production.

## Authentication

Every route except `GET /api/health` requires an Auth0 access token:

```
Authorization: Bearer <access_token>
```

The token must be a JWT issued for the API audience — if `audience` is omitted when
requesting it, Auth0 returns an opaque token and every call fails with 401.

**Development without Auth0:** when `AUTH0_ISSUER_BASE_URL` and `AUTH0_AUDIENCE` are unset
and `NODE_ENV` is not `production`, requests are attributed to a local development user and
no token is needed. This fallback is refused in production.

## Error shape

Every failure returns the same envelope, which the client renders directly:

```json
{ "error": { "message": "Course not found.", "code": "invalid_id", "details": {} } }
```

`code` and `details` are optional. Ownership failures return **404, not 403**, so course IDs
cannot be enumerated.

| Status | Meaning |
|---|---|
| 400 | Invalid input (topic too short, malformed ObjectId, lesson not yet generated) |
| 401 | Missing, expired or opaque token |
| 404 | Not found, or not yours |
| 429 | Rate limit reached (see headers) |
| 502 | The AI service failed or returned unusable output after a retry |
| 503 | A required service is not configured on the server |

---

## Health

### `GET /api/health`

Public. Also used by the frontend on load to pre-warm Render's cold start.

```json
{
  "ok": true,
  "uptime": 128,
  "env": "production",
  "services": { "mongo": true, "auth0": true, "gemini": true, "youtube": false }
}
```

`services` reports which integrations are configured — useful for diagnosing a deployment
without reading logs.

---

## Courses

### `POST /api/courses/generate`

Stage 1 of generation. One Gemini call produces the outline; it is persisted immediately
with lessons as un-generated stubs. Takes roughly 5–10 seconds.

```json
{
  "topic": "Intro to React Hooks",
  "moduleCount": 4,
  "lessonsPerModule": 4,
  "difficulty": "beginner-to-intermediate"
}
```

| Field | Required | Notes |
|---|---|---|
| `topic` | yes | 3–300 characters |
| `moduleCount` | no | Clamped to 3–6. Omit to let the model choose. |
| `lessonsPerModule` | no | Clamped to 3–5. |
| `difficulty` | no | Free text, e.g. `complete beginner`, `advanced` |

**`201`** → `{ "course": { ...tree with lesson titles... } }`

Rate limited (default 10 per hour per user). Concurrent identical requests from the same
user share one result, so a double-clicked button creates one course.

### `GET /api/courses`

The caller's courses, newest first.

```json
{
  "courses": [
    {
      "id": "6a70...",
      "title": "Introduction to React Hooks",
      "description": "…",
      "tags": ["react", "hooks"],
      "status": "ready",
      "createdAt": "2026-08-03T09:26:03.792Z",
      "moduleCount": 3,
      "lessonCount": 9
    }
  ]
}
```

### `GET /api/courses/:courseId`

The full tree. **Lesson content is deliberately omitted** — enriched lessons run to tens of
kilobytes each and the syllabus view never needs them.

```json
{
  "course": {
    "id": "6a70...",
    "title": "Introduction to React Hooks",
    "modules": [
      {
        "id": "6a70...",
        "title": "Hook Fundamentals",
        "summary": "…",
        "lessons": [
          { "id": "6a70...", "title": "Why Hooks Replaced Class Components", "isEnriched": true }
        ]
      }
    ]
  }
}
```

### `DELETE /api/courses/:courseId`

Cascades to modules and lessons. **`204`** on success.

### `GET /api/courses/:courseId/module/:moduleIndex/lesson/:lessonIndex`

Stage 2 of generation. Indices are zero-based positions in the arrays.

**If the lesson has not been generated yet, this call generates it** (10–20 seconds) and
persists the result. Every later request is served from the database.

```json
{
  "lesson": {
    "id": "6a70...",
    "title": "The Rules of Hooks",
    "objectives": ["State the two rules of hooks", "…"],
    "resources": [
      { "title": "React docs: Rules of Hooks", "kind": "documentation", "query": "react.dev reference rules of hooks" }
    ],
    "isEnriched": true,
    "content": [
      { "type": "heading", "text": "Two rules, one reason", "level": 2 },
      { "type": "paragraph", "text": "Call hooks at the **top level**…" },
      { "type": "code", "language": "jsx", "text": "const [a, setA] = useState(0);" },
      { "type": "video", "query": "rules of hooks react explained" },
      {
        "type": "mcq",
        "question": "Why must hook order be stable?",
        "options": ["For bundle size", "React matches state by call order"],
        "answer": 1,
        "explanation": "State is stored positionally per component."
      }
    ]
  },
  "context": {
    "courseTitle": "Introduction to React Hooks",
    "moduleTitle": "Hook Fundamentals",
    "position": 2,
    "total": 9,
    "prev": { "moduleIndex": 0, "lessonIndex": 0 },
    "next": { "moduleIndex": 0, "lessonIndex": 2 }
  }
}
```

`context` supplies the breadcrumb and prev/next targets so the viewer renders from a single
request. Navigation crosses module boundaries: the last lesson of module 0 has module 1's
first lesson as its `next`.

If generation fails, the lesson is returned with `isEnriched: false` and `enrichError` set,
so the UI can explain and offer a retry. The error clears automatically once a later attempt
succeeds.

See [`shared/contentBlocks.js`](../shared/contentBlocks.js) for the authoritative block
contract. Clients must ignore unrecognised `type` values rather than failing.

---

## Lessons

### `POST /api/lessons/:lessonId/regenerate`

Forces a fresh generation of an already-generated lesson.

**`200`** → `{ "lesson": { … } }`

### `POST /api/lessons/:lessonId/translate`

Translates the lesson prose to Hinglish — Hindi grammar in Devanagari with English
technical terms kept intact. The result is **cached on the lesson**, so this is paid for
once.

**`200`** → `{ "hinglish": "…", "cached": false }`

`400` if the lesson has no content yet.

### `POST /api/lessons/:lessonId/audio`

Synthesises narration and streams a complete `.wav` (24 kHz, 16-bit, mono).

```json
{ "language": "hinglish", "voice": "Kore" }
```

| Field | Default | Notes |
|---|---|---|
| `language` | `hinglish` | `hinglish` or `english` |
| `voice` | `GEMINI_TTS_VOICE` | A Gemini prebuilt voice name |

**`200`** → `audio/wav` binary, `Content-Disposition: inline`.

**Audio is not cached** — several megabytes per lesson would strain MongoDB's 16 MB document
limit for a feature used about once per lesson. The translation it is built from *is*
cached, so a repeat request re-synthesises but does not re-translate.

Tightly rate limited (20 per 15 minutes per user): this is two AI calls, and TTS is billed
per character.

---

## Videos

### `GET /api/youtube/search?query=rules+of+hooks+explained`

Resolves a search query to an embeddable video. Authenticated, so the proxy cannot be used
as a free public YouTube search against our quota.

**Always returns `200`.** A `null` videoId is a normal outcome and the client renders a
"Search on YouTube" link — a missing video must never fail a lesson.

```json
{ "videoId": "abc123", "title": "Rules of Hooks", "channelTitle": "…" }
```

```json
{ "videoId": null, "title": null, "channelTitle": null, "reason": "quota_exceeded" }
```

| `reason` | Cached? |
|---|---|
| `no_results` | yes — a definitive answer, worth 100 quota units not to repeat |
| `quota_exceeded` | **no** — would permanently blank a video that works tomorrow |
| `request_failed`, `http_5xx` | **no** — transient |
| `not_configured` | no — so adding a key later takes effect at once |

The YouTube Data API allows only ~100 searches per day (10,000 units at 100 per search), so
results are cached indefinitely on a normalised query key.

---

## Account

### `GET /api/me`

Returns the caller's profile, creating it on first call from the verified JWT claims. This
is the first-login upsert; identity itself always comes from the token.

```json
{
  "user": {
    "id": "6a70...",
    "email": "you@example.com",
    "name": "You",
    "picture": "https://…",
    "prefs": { "autoTranslateToHinglish": false }
  }
}
```

### `PATCH /api/me`

```json
{ "prefs": { "autoTranslateToHinglish": true } }
```

Only recognised boolean preferences are applied; anything else in the body is ignored.

---

## Rate limits

Keyed on the JWT `sub` rather than IP — IP is both too coarse (shared NAT) and too easy to
rotate. Responses carry `RateLimit` headers (draft-7).

| Endpoints | Default limit |
|---|---|
| `POST /api/courses/generate` | 10 / hour (`RATE_LIMIT_GENERATIONS`) |
| Lesson read + regenerate | 60 / 15 min |
| `translate`, `audio` | 20 / 15 min |
