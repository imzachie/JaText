# JaText on Cloudflare Pages + Supabase (no laptop involved)

Everything below runs from two dashboards and one `git push`. There is no server to
log into, no systemd unit, no cloudflared, and no Vercel.

## The shape of it

```
browser / APK
    │  https://jatextapp.pages.dev
    ▼
Cloudflare Pages ──► static site (dist/)
    │
    └─ functions/api/[[path]].js  forwards every /api/* call
              │
              ▼
Supabase Edge Function  jatext-api        ← supabase/functions/jatext-api/index.ts
    │  api/turso.js, api/media.js, ... bundled in by scripts/build-edge-function.mjs
    ▼
Supabase Postgres  (db.nroosqwxyhkavdokxahn.supabase.co:5432)
```

* The website and the API share one public origin, so there is no CORS and the
  session cookie/token stays first party. The APK keeps working without a rebuild
  because it also talks to `https://jatextapp.pages.dev`.
* The API is the same `api/*.js` + `server/tursoBackend.js` code the old Node
  server ran. It is portable now because `server/runtimeCompat.js` replaces
  `node:crypto` (SHA-256/SHA-1/HMAC/PBKDF2/scrypt, all verified byte-for-byte
  against Node) and `server/fcmRestClient.js` replaces `firebase-admin` with a
  plain `fetch` call to the FCM v1 endpoint.

## What is already configured

| Thing | Where | Value |
| --- | --- | --- |
| Project | Supabase | `nroosqwxyhkavdokxahn` (ap-southeast-2, Postgres 17) |
| Tables | Supabase → SQL editor | 28 tables + indexes, created from `scripts/dump-supabase-schema.mjs` |
| DB role | Supabase | `jatext_api` (owns nothing, has full rights on `public`) |
| Secrets | Supabase → Edge Functions → Secrets | `DATABASE_URL`, `AUTH_SECRET`, `PUBLIC_APP_ORIGIN`, `PG_POOL_MAX`, `PGSSLMODE` |
| API origin | `functions/api/[[path]].js` | defaults to this project's function URL, no Pages setting needed |
| Pages build | Cloudflare | framework **React (Vite)**, build `npm run build`, output `dist` |

The frontend needs **no environment variables**. `JATEXT_API_ORIGIN` exists only to
point the same build at a different backend.

## The one step left: let CI publish the function

Supabase only accepts an edge-function upload from something holding an access
token, and CI is that something.

1. <https://supabase.com/dashboard/account/tokens> → **Generate new token** → copy it.
2. <https://github.com/imzachie/JaText/settings/secrets/actions> →
   *New repository secret* → name `SUPABASE_ACCESS_TOKEN`, paste the value.

From then on, any push to `main` that touches `server/`, `api/`, `supabase/` or
`runtime/` runs `.github/workflows/deploy-edge-function.yml`, which bundles the
function and publishes it. Pushes that touch nothing there skip the job.

## Changing the API config later

Secrets live in Supabase, not in the repo:
Supabase dashboard → project → **Configuration → Environment variables → Edge Functions → Secrets**.
Add, replace, or delete there and the next request picks it up.

| Secret | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | everything | already set; `postgres://jatext_api:…@db.nroosqwxyhkavdokxahn.supabase.co:5432/postgres?sslmode=require` |
| `AUTH_SECRET` | sign-in tokens | already set; rotating it signs everyone out |
| `PUBLIC_APP_ORIGIN` | link previews, OAuth redirects | `https://jatextapp.pages.dev` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign in with Google | redirect URI `https://jatextapp.pages.dev/api/oauth-google` |
| `FCM_SERVICE_ACCOUNT_JSON` | Android push | the whole `service_account` JSON, base64 or raw |
| `KLIPY_API_KEY` | song search | |

## Checks worth doing after the first deploy

```
https://jatextapp.pages.dev/api/auth-status        → "engine":"postgresql","dbConnected":true
https://jatextapp.pages.dev/api/health             → the function's own router answers this
```

If `auth-status` returns `Could not reach the JaText backend`, the function is not
deployed yet (check the Actions tab). If it deploys but `dbConnected` is false, the
message carries the Postgres error; the usual cause is the network path to port
5432, in which case switch `DATABASE_URL` to the session pooler host
`aws-0-ap-southeast-2.pool.supabase.com:5432` and username `jatext_api`.

## The APK download

A signed release APK is about 50 MB and **Pages refuses any single asset over
25 MB**, so the binary is not part of the site. `scripts/build.mjs` copies only
`release-cdn/apk-version.json` into `dist/`, and the `downloadUrl` inside it points
at the `apk-latest` GitHub Release that the same workflow publishes.
`/downloads/JaText-release.apk` is a 302 to that release, kept so install links
printed before the move still work.

## Attachments

Uploads are stored in Postgres (`media_blobs`, `media_chunks`), which counts against
the 500 MB database on the free plan. Moving them to Supabase Storage is the next
planned change; until then watch **Settings → Usage** if the app gets real traffic.

## Why there is no domain

`jatextapp.pages.dev` is the public origin on purpose. A `*.pages.dev` hostname is
already HTTPS, already behind Cloudflare's edge, needs no DNS record, no
certificate and no renewal, and it cannot be pointed at a machine that gets
switched off. Nothing in the app assumes a custom domain.

If a domain is ever wanted, two things have to move together: `PUBLIC_APP_ORIGIN`
in Supabase (which also changes the passkey relying party, so passkeys are
re-enrolled) and `API_ORIGIN` in `android/app/build.gradle`, which means a new APK
build. Doing one without the other is how an app ends up talking to a dead host.
