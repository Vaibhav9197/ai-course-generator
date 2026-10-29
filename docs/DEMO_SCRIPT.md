# Demo script & manual test checklist

The brief asks for a 5-minute video showing prompt input, the generation flow, and a code
architecture overview. This doubles as the manual test checklist for the paths automated
tests cannot reach (PDF rasterisation, the Auth0 redirect, real audio playback).

## Before recording

- [ ] Load the site once a minute for a few minutes — Render's free tier cold-starts in
      ~50 seconds and that would be the first thing on camera.
- [ ] Have a **second** browser profile signed in as a different account, ready to show
      per-user isolation.
- [ ] Pre-generate one course so you have an already-populated library to show; generate a
      *different* one live.
- [ ] Check remaining YouTube quota (~100 searches/day) if you want videos to load live.
- [ ] Close the tab with your API keys visible.

---

## Runsheet (5:00)

### 0:00–0:30 — What and why

> "Text-to-Learn turns any topic into a structured course. Instead of searching for
> tutorials and stitching them together, you type what you want to learn and get a syllabus
> with lessons, quizzes, videos, and offline PDFs."

Show the logged-out landing prompt. Sign in with Auth0 — let the redirect play out on
camera; it is a graded requirement.

### 0:30–1:15 — Prompt to course

Type a topic that is clearly not hardcoded — ask the viewer's-eye topic, e.g.
**"Basics of Copyright Law for Photographers"**.

While it generates (5–10s), say what is happening:

> "This is one AI call producing just the syllabus — titles only. That is why it takes
> seconds rather than minutes. The lesson bodies aren't written yet."

Land on the course page. Point out modules ordered foundational → advanced, and the lesson
count.

### 1:15–2:15 — A lesson being written

Open the first lesson. Narrate the wait:

> "This lesson doesn't exist yet. Opening it is what generates it — objectives, explanation,
> examples, and a quiz — and then it's cached forever. Each lesson costs exactly one AI call
> for the life of the course."

When it renders, scroll through and show: objectives panel, prose, a syntax-highlighted code
block (use a technical topic if you want this guaranteed), the embedded video, and the quiz.

**Answer one question wrong on purpose** — the explanation appearing is the point.

Then navigate back into the same lesson to show it is instant.

### 2:15–2:45 — Hinglish narration

Click *Generate audio*. While it works:

> "This translates the lesson into Hinglish — Hindi sentence structure with the technical
> terms left in English, because that's how people actually discuss this material — then
> synthesises speech."

**Play a few seconds of audio out loud.** Show the transcript. Mention the `.wav` download.

### 2:45–3:05 — PDF export

Click **PDF**. Open the downloaded file on camera and scroll it: objectives, prose, code,
questions with the correct answers marked.

> "The PDF renders from a separate print tree, so it looks identical whether you're in light
> or dark mode."

Toggle dark mode and export again to prove it if time allows.

### 3:05–3:30 — It's really per-user

Switch to the second browser profile. Show that account's library is empty — or has entirely
different courses.

> "Courses are scoped to the Auth0 subject. Requesting someone else's course returns a 404,
> not a 403, so IDs can't be enumerated."

### 3:30–4:40 — Code architecture

Screen-share the editor. Walk four things, in this order:

1. **`shared/contentBlocks.js`** — "One block contract. It's the AI's response schema, the
   validator, the database shape, and the key into the React component registry. Video
   blocks carry a search *query*, never a URL, because model-invented links are dead links."

2. **`server/services/aiJson.service.js`** — "AI output is the only data here I don't
   control, so this is the boundary. Fences, prose, truncation, too many modules, an MCQ
   answer index pointing past its own options. It clamps what it can and drops individual bad
   blocks rather than throwing away 2,000 words of correct prose."

3. **`server/services/gemini.service.js`** — "One retry, with the specific validation error
   and the model's own bad output fed back at a lower temperature. A blind retry just
   reproduces the mistake."

4. **`server/utils/inFlight.js` + rate limits** — "A public URL in front of a paid API is an
   open invoice. Identical concurrent requests share one call, and limits are keyed on the
   user, not the IP."

Then show the test summary: `npm test` → 147 server + 23 client.

### 4:40–5:00 — Close

> "React and Vite on Vercel, Express and Mongoose on Render, MongoDB Atlas, Gemini for
> generation, translation and speech. CI runs lint and tests on every pull request."

Show the CI checks green on a PR if you have one.

---

## Manual test checklist

Things the automated suite deliberately does not cover.

### Auth (needs a real tenant)
- [ ] Logged out, a lesson deep link shows the sign-in prompt rather than an error
- [ ] Login redirects back to the page you were trying to reach, not the home page
- [ ] Hard refresh keeps you signed in (silent refresh works)
- [ ] Works in Safari or Brave — the third-party-cookie case refresh tokens exist for
- [ ] Logout returns to the landing page and the API rejects further calls

### PDF (needs a real browser)
- [ ] A long lesson produces a correctly split multi-page PDF
- [ ] Output is byte-for-byte comparable in light and dark mode
- [ ] Long code lines wrap instead of being clipped
- [ ] Bold and inline code render as formatting, not visible `**` and backticks
- [ ] Correct MCQ answers are marked and explanations included
- [ ] A Devanagari lesson title produces a readable filename, not `h-d-p-th.pdf`

### Audio
- [ ] Hinglish narration is intelligible and paced for a learner
- [ ] English technical terms are pronounced as English, not read as Hindi
- [ ] The downloaded `.wav` opens in an external player (proves the RIFF header)
- [ ] Navigating away mid-playback does not leak the object URL (check memory)

### Failure modes — worth rehearsing before a demo
- [ ] Unset `GEMINI_API_KEY` → friendly 503 naming the variable, no crash
- [ ] Unset `YOUTUBE_API_KEY` → videos degrade to "Search on YouTube" links
- [ ] Exhausted YouTube quota → same fallback, not an error state
- [ ] Stop the backend → the client shows "Cannot reach the server", not a blank page
- [ ] Double-click Generate → one course appears, not two
- [ ] Open the same lesson in two tabs → one generation, both render

### Responsive
- [ ] Sidebar collapses to a drawer below `lg`, and closes on navigation
- [ ] Code blocks scroll horizontally rather than breaking the layout
- [ ] Lesson page is readable at 375px wide
