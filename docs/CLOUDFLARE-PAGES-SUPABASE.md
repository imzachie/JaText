# JaText with no laptop: Cloudflare Pages + Vercel + Supabase

This replaces the Ubuntu laptop completely. Nothing on your machine has to stay
on, and every piece deploys itself from the GitHub repo.

| Piece | Where it lives | What it does |
| --- | --- | --- |
| Website | Cloudflare Pages | The built site, served at `https://jatext.us.ci` |
| Backend API | Vercel | `/api/turso`, `/api/media`, sign in, push |
| Database | Supabase | Postgres, replaces the PostgreSQL on the laptop |

The Pages site forwards `/api/*` to Vercel through
`functions/api/[[path]].js`, so the app still only ever talks to
`https://jatext.us.ci`. That is also why the Android APK needs no change: it was
built against that address, and the address keeps working.

Pages cannot proxy to another host from `_redirects` (rewrites are limited to
paths inside the same project), which is why the forwarding is a Pages Function.

---

## 1. Supabase (the database)

1. <https://supabase.com/dashboard> → **New project**. Region: Singapore. Set a
   database password and keep it.
2. **Project settings → Database → Connection string**. Copy the **URI** and
   switch on **Connection pooling** (it is the `aws-0-...pooler.supabase.com`
   host, port **6543**, transaction mode). Serverless functions must use the
   pooler, not the direct 5432 connection.
3. That is all Supabase needs. JaText creates its own 28 tables on the first
   request, so there is nothing to import.

You will end up with something shaped like:

```
postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require
```

## 2. Vercel (the API)

1. <https://vercel.com/new> → import `Ahad00010/JaText`.
2. Framework preset **Vite**. Set **Build and Development Output Directory** to
   `dist` (it is unused for the API, but the build must not fail). Under
   **Functions**, no changes are needed, `api/*.js` is already the Vercel shape.
3. **Settings → Environment Variables → Production**, add every one of these,
   then redeploy:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require
PUBLIC_APP_ORIGIN=https://jatext.us.ci
AUTH_SECRET=<64 random hex characters>
PG_POOL_MAX=2
GOOGLE_CLIENT_ID=<your-id.apps.googleusercontent.com>
GOOGLE_CLIENT_SECRET=<your-google-secret>
FCM_SERVICE_ACCOUNT_JSON=<base64 of fcm-service-account.json>
KLIPY_API_KEY=<klipy key>
```

Only the first four are required to be online. `PG_POOL_MAX=2` matters: the
default of 20 connections per function instance floods Supabase's pooler.

- `AUTH_SECRET` signs login tokens. Any long random string works, from
  `openssl rand -hex 32`. Keep it the same forever or everyone is signed out.
- Push needs `FCM_SERVICE_ACCOUNT_JSON`, not a file path. Encode the key once:
  `base64 -w0 fcm-service-account.json` and paste the single line. The server
  detects base64 automatically. Without it, push silently does nothing.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are the same values as before.
  In Google Cloud, the OAuth client still lists
  `https://jatext.us.ci` as a JavaScript origin and
  `https://jatext.us.ci/api/oauth-google` as a redirect URI. Neither changes,
  because the domain does not change.

4. Check it works, you want `"dbConnected": true`:

```
curl -sS https://<vercel-host>/api/auth-status
```

## 3. Cloudflare Pages (the website)

Already connected in your screenshot. Keep it exactly as it is:

| Field | Value |
| --- | --- |
| Framework preset | React (Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |

Then **Settings → Environment variables → Production**, and add one variable:

```
JATEXT_API_ORIGIN=https://<vercel-host>
```

That is the whole Pages configuration. Do not set `VITE_API_ORIGIN` (it would
make the browser call Vercel directly and you lose first-party sign in), do not
set `VITE_DEMO_MODE` (it turns the app into browser-only fake data), and do not
set `VITE_CONVEX_URL` (old backend, unused).

## 4. Move the domain off the laptop

1. Cloudflare dashboard → **Workers & Pages → your Pages project → Custom
   domains** → add `jatext.us.ci`. Cloudflare moves the DNS record itself.
2. Delete the old tunnel record, and the CNAME that pointed at
   `*.cfargotunnel.com`, if the add flow does not do it for you.
3. On the laptop, stop the old server so nothing competes with it:
   `sudo systemctl disable --now jatext.service` and
   `sudo systemctl disable --now cloudflared`. Or just leave it switched off,
   which is the same thing.

## 5. Data

If the laptop database has your existing accounts and messages, dump it before
cutting over and restore into Supabase:

```
pg_dump "postgresql://jatext:<pw>@127.0.0.1:5432/jatext" -Fc > jatext.dump
pg_restore -d "postgresql://postgres.<ref>:<pw>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require" --no-owner jatext.dump
```

Restore uses port **5432**, not the pooler, because `pg_restore` needs a session
connection. If you are happy starting empty, skip this entirely.

## 6. The APK

Nothing to rebuild. The app already points at `https://jatext.us.ci`, the
domain keeps working through the Pages forward, and the update check reads
`/apk-version.json` with a copy published to GitHub as the fallback, so
downloading and self updating survive without any server of your own.

## What is still laptop-flavoured

- **Attachments are stored inside Postgres** (`media_blobs`, `media_chunks`).
  It works on Supabase, but a 500 MB database fills up with videos. Moving them
  into Supabase Storage is the next change.
- **5 GB uploads** are still web-only, the app caps at 48 MB.
- **Link previews and media URLs** assume `PUBLIC_APP_ORIGIN` is the public
  origin, so it must stay `https://jatext.us.ci` on Vercel, not the
  `*.vercel.app` host.
- **Passkeys** stay valid, the relying party id is still `jatext.us.ci`.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `/api/auth-status` says `dbConnected: false` | Wrong `DATABASE_URL`, or port 6543 replaced with 5432 in a function, or `sslmode=require` missing |
| App loads, sign in spins forever | `JATEXT_API_ORIGIN` missing on Pages, so `/api/*` has nowhere to go |
| `relation "users" does not exist` | The role in the connection string lacks permission on the schema. Supabase's `postgres` user is fine, a custom role needs `GRANT ALL ON SCHEMA public TO <role>` |
| Downloads restart from zero every time | Stale partial file, fixed in 4.4.2. Update the APK |
| Push never arrives | `FCM_SERVICE_ACCOUNT_JSON` mangled, or `GOOGLE_ANDROID_CLIENT_ID` unset when the app uses its own OAuth client |
