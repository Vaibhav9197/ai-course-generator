# Deployment

Backend on Render, frontend on Vercel, both from one repository. Order matters: the backend
needs the frontend's URL for CORS, and the frontend needs the backend's URL for API calls,
so there is one deliberate loop where you come back and fill in a value.

## 0. Provision the external services

| Service | What you need | Where |
|---|---|---|
| MongoDB Atlas | Connection string | Free M0 cluster → Connect → Drivers |
| Google Gemini | API key | <https://aistudio.google.com/apikey> |
| YouTube Data API v3 | API key | Google Cloud Console → enable the API → Credentials |
| Auth0 | Tenant + SPA app + API | <https://manage.auth0.com> |

**Atlas network access:** Render's free tier has no static outbound IP, so allow `0.0.0.0/0`
under Network Access. Security rests on the connection credentials. Use a database user
scoped to this one database, not an admin user.

**Auth0 setup:**

1. **Applications → Create Application** → *Single Page Web Application*. Note the Domain
   and Client ID.
2. **APIs → Create API.** Set an identifier such as `https://text-to-learn/api` — this
   becomes your **audience** and must match on both sides exactly.
3. Leave the callback URLs for step 3 below, once you know your Vercel URL.

## 1. Backend → Render

The repository contains [`render.yaml`](../render.yaml), so use **New → Blueprint** and
point it at your repo. Render reads the build command, start command, root directory and
health check path from it, and prompts for each secret.

If you prefer to create the service by hand, use:

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm ci` |
| Start Command | `node server.js` |
| Health Check Path | `/api/health` |

Set these environment variables:

```
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb+srv://…
AUTH0_ISSUER_BASE_URL=https://your-tenant.us.auth0.com/     # trailing slash required
AUTH0_AUDIENCE=https://text-to-learn/api
GEMINI_API_KEY=…
GEMINI_TEXT_MODEL=gemini-3.5-flash-lite
GEMINI_TTS_MODEL=gemini-3.8-flash-lite-tts
YOUTUBE_API_KEY=…
CLIENT_ORIGIN=https://placeholder.vercel.app                 # corrected in step 4
```

> **Confirm the model IDs before deploying.** Gemini identifiers change, and older models are
> withdrawn for new API keys (`gemini-2.5-flash` now returns "no longer available to new
> users"). Check <https://ai.google.dev/gemini-api/docs/models> and use current values. A
> rejected ID produces a 503 that names `GEMINI_TEXT_MODEL` or `GEMINI_TTS_MODEL` and quotes
> Google's reason, so the error tells you which variable to fix.
>
> **On the free tier, prefer Flash-Lite.** Third-party reports put `gemini-3.8-flash` at
> roughly 20 requests/day versus about 500 for the Flash-Lite models; a single course can
> need 30+ requests. TTS quotas are far smaller still. Check your project's real limits in
> Google AI Studio.

In production the server **requires** `MONGO_URI`, both Auth0 values and `GEMINI_API_KEY`,
and refuses to start without them. That is intentional: the unauthenticated development
fallback must never be reachable on a public URL.

Verify: `curl https://your-backend.onrender.com/api/health` should report every service as
`true` except `youtube` if you skipped that key.

## 2. Frontend → Vercel

**New Project** → import the repo → **leave Root Directory at the repository root.**

[`vercel.json`](../vercel.json) supplies the build command and output directory. Do *not*
set Root Directory to `client`: that would put the sibling `shared/` directory outside the
build context and the build would fail on an unresolved import.

Environment variables:

```
VITE_API_URL=https://your-backend.onrender.com
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=…
VITE_AUTH0_AUDIENCE=https://text-to-learn/api
```

`VITE_AUTH0_AUDIENCE` must equal `AUTH0_AUDIENCE` on the server. If it is missing, Auth0
issues an opaque token instead of a JWT: login appears to work and every API call returns
401. That is the single most common way this integration fails.

Never put a Gemini or YouTube key here. Every `VITE_*` value is inlined into the public
JavaScript bundle.

## 3. Point Auth0 at the deployed frontend

In your Auth0 **Application** settings, add your Vercel URL:

| Field | Value |
|---|---|
| Allowed Callback URLs | `https://your-app.vercel.app/callback`, `http://localhost:5173/callback` |
| Allowed Logout URLs | `https://your-app.vercel.app`, `http://localhost:5173` |
| Allowed Web Origins | `https://your-app.vercel.app`, `http://localhost:5173` |

Under **Advanced → Grant Types**, ensure *Refresh Token* is enabled — the client uses
refresh tokens so sessions survive browsers that block third-party cookies.

## 4. Close the loop

Set `CLIENT_ORIGIN` on Render to your real Vercel URL and redeploy. Vercel preview
deployments (`*.vercel.app` branch subdomains) are allowed automatically by the CORS check
in [`server/app.js`](../server/app.js), so only the production URL needs listing.

For several origins, comma-separate: `https://a.vercel.app,https://custom.domain`.

## 5. CI/CD

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs lint and tests for both
packages on every pull request, plus a client build. Render and Vercel each auto-deploy on
merge to `main`.

Working style, per the brief: branch per feature, open a PR, let CI go green, merge with
`--no-ff` so the history shows each feature as a unit.

## Cold starts

Render's free tier suspends after ~15 minutes idle and takes roughly 50 seconds to wake.
The frontend calls `/api/health` as soon as it loads so the backend is warming while the
user reads the page — but if you are recording a demo, **load the site once a minute
beforehand** so the first real interaction is not a 50-second wait.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Login succeeds, every API call 401s | `VITE_AUTH0_AUDIENCE` missing or not matching `AUTH0_AUDIENCE` |
| CORS error in the console | `CLIENT_ORIGIN` on Render does not include the Vercel URL |
| 503 naming `GEMINI_TEXT_MODEL` | Stale model ID — check the models docs |
| 503 mentioning `GEMINI_API_KEY` | Key missing, revoked, or lacking Generative Language API access |
| Videos all show "Search on YouTube" | No `YOUTUBE_API_KEY`, or the daily 100-search quota is spent |
| Refreshing a lesson URL 404s | SPA rewrite missing — confirm `vercel.json` was picked up |
| Server exits on boot | A required production variable is unset; the log names it |
| First request takes ~50s | Render free-tier cold start |
