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
| Schema rights | Supabase | the app's role owns nothing and may not run DDL; the app detects that and uses the schema as applied |
| DB role | Supabase | `jatext_api` (owns nothing, has full rights on `public`) |
| Secrets | Supabase → Edge Functions → Secrets | `DATABASE_URL`, `AUTH_SECRET`, `PUBLIC_APP_ORIGIN`, `PG_POOL_MAX`, `PGSSLMODE` |
| Attachments | Supabase → Storage | public bucket `jatext-media`, one object per file; the row keeps a `storage_key` |
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
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign in with Google | redirect URI `https://jatextapp.pages.dev/api/oauth-google`, and the consent screen must be **In production** (or the address added under **Test users**) or Google answers `403 access_denied`. `GET /api/oauth-google?action=config` is what the APK polls; when it returns the `clientId`, the button works, no new build needed |
| `FCM_SERVICE_ACCOUNT_JSON` | Android push | the whole `service_account` JSON, base64 or raw |
| `KLIPY_API_KEY` | song search | |
| `BREVO_SENDER_EMAIL` | the signup code email | must be an address Brevo has already verified under **Senders, Domains, IPs → Senders**, or every send comes back as `sender not verified`. `BREVO_SENDER_NAME` is optional (default `JaText`) |
| `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASS` | sending that email | the relay Brevo actually allows from here: `smtp-relay.brevo.com`, `587` for STARTTLS (`465` for implicit TLS, which the port picks by itself or `BREVO_SMTP_SSL=1` forces), the `…@smtp-brevo.com` login and the SMTP key. Not IP restricted, which is why it is used at all |
| `SMTP_REQUIRE_TLS`, `SMTP_TLS_REJECT_UNAUTHORIZED` | how far to trust the relay | both default to on: a relay that will not upgrade is refused rather than sent a password, and a certificate the runtime does not trust ends the send. Only `SMTP_TLS_REJECT_UNAUTHORIZED=0` has a legitimate use, which is a relay whose CA is not in the store |
| `BREVO_API_KEY` | the same email, over HTTP | starts with `xkeysib-`, 89 characters. **Useless from an Edge Function on its own**: Brevo limits API keys to allow-listed source addresses and this runtime has no fixed egress IP, so it answers 401 `unrecognised IP address`. Kept because a self-hoster on a fixed address can use it, and because the code falls back to it if the relay cannot be reached |
| `JATEXT_REQUIRE_EMAIL_VERIFICATION` | turning the signup code on | `1` = every new account must type the emailed code before it can message anyone; anything else, or a missing `BREVO_API_KEY`, and sign-up behaves exactly as it always did |
| `SUPABASE_SERVICE_ROLE_KEY` | attachments in Storage | without it, uploads keep going into Postgres; `SUPABASE_URL` is not needed, the ref is read from `DATABASE_URL` |

## Checks worth doing after the first deploy

```
https://jatextapp.pages.dev/api/auth-status        → "engine":"postgresql","dbConnected":true,"mediaStorage":"supabase","emailVerificationRequired":false
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

Photos, voice notes and videos live in **Supabase Storage**, bucket `jatext-media`
(public, one object per attachment at `<userId>/<mediaId>`). The database keeps the
row only: mime type, file name, size and a `storage_key` pointer, so an attachment no
longer counts against the 500 MB database. The free plan gives 1 GB of Storage and 100
GB of egress, which is a much larger allowance than the database was.

`/api/media?id=…` stays the only URL the app knows. What it does with it:

| Request | Answer |
| --- | --- |
| `GET` with no `Range` | 302 to the public object, so the bytes never pass through the function |
| `GET` with a `Range` | 206 slice, read from Storage and served under the same origin |
| `HEAD` | answered from the row, including `X-JaText-Total-Size` (the APK's video downloader reads that header) |
| `POST` | writes the object, then stores the pointer; on any Storage failure it falls back to the row |

Uploads of up to 16 MB are moved whole (a single-shot upload, or a chunked upload that
is promoted once its last chunk arrives, after which its `media_chunks` rows are
deleted). A file larger than that keeps streaming through `media_chunks` as it always
did: buffering a whole video in the function to save a row is how an edge function runs
out of memory. Old attachments already in Postgres keep working, they are simply served
from the row.

`node scripts/test-media-storage.mjs` covers all of it against a stub bucket and a stub
database, including the no-Storage-installed case.

### Turning it on

The bucket, the read policy and the `storage_key` column already exist on
`nroosqwxyhkavdokxahn`. Only the secret is missing, because a key value cannot be read
back out of the dashboard by anyone but the person looking at the screen:

1. Open `https://supabase.com/dashboard/project/nroosqwxyhkavdokxahn/settings/api-keys`.
2. Scroll to **Legacy API keys**, find the row labelled `service_role`, and click
   **Reveal** then the copy icon next to it.
3. Click the **gear icon** at the bottom of the left sidebar, then the
   **Edge Functions** tab, then **Secrets**.
4. Click **Add new secret**.
5. In **Name** type `SUPABASE_SERVICE_ROLE_KEY`. In **Value** paste the key from step 2.
6. Click **Add secret** (then **Save** if it asks).
7. Open `https://jatextapp.pages.dev/api/health` and check the page says
   `"mediaStorage": "supabase"`. `"database"` means step 5 or 6 did not take.
8. Send a photo in a chat, then open **Storage → Browse → jatext-media** in the
   dashboard: the file should be listed there.

Nothing else needs to change. The APK, the web client and the stored message rows all
keep using `/api/media?id=…`; the redirect happens in front of them. If the secret is
ever removed, new uploads go back to the database, and a file already in the bucket
answers with a 503 naming that secret instead of a blank thumbnail clients would cache
forever.

## Signing up: the email code

`signUpEmail` can now refuse to hand out a session until the address in it has been
proved. The whole thing sits behind two conditions, both of which have to hold:
`JATEXT_REQUIRE_EMAIL_VERIFICATION` is `1`, and Brevo is configured. With either
missing, nothing about sign-up changes, and existing accounts are untouched: the
`email_verified` column was added with `DEFAULT 1`, so nobody was ever locked out by
the migration.

What a new person sees: the account is created, a 6-digit code is mailed, and the app
shows one box and nothing else. Onboarding, chats, settings and every other screen are
behind it, because no session token is issued at all. `handleTursoRpc` also checks the
flag before `sendMessage`, `sendGroupMessage`, `sendCommunityMessage`,
`sendFriendRequest`, `createGroup`, `createCommunity`, `createDeviceLinkSession` and
`approveDeviceLinkSession`, so a token that arrived some other way (an older build, a
linked device) still cannot reach anybody until the code is entered.

Details worth knowing before changing it:

* The code is never stored. `email_verifications.code_hash` is an HMAC-SHA256 of
  `email-code:<code>` keyed with `AUTH_SECRET`, so a database read cannot hand out
  working codes, and rotating `AUTH_SECRET` invalidates every outstanding code (which
  is fine: asking for another one is one click).
* 10 minutes to live, six wrong tries then the code is burned, 45 seconds between two
  sends. All three numbers are only enforced server-side, and the resend answer carries
  `retryAfterSec` so the client counts down the number the server actually used.
* Before the password is checked for a second time: signing in to an unverified account
  refuses the session and sends a fresh code, so the code cannot be skipped by choosing
  a different device.
* If Brevo refuses the send, the signup is rolled back and the error comes from
  the request itself, with Brevo's own words in it. A half-made account would squat on
  the address forever and turn "try again" into "an account already exists for this
  email".
* There are two ways to hand the mail to Brevo and they fail differently, which is why both
  are implemented. The HTTP API key is restricted to allow-listed source addresses, and a
  Supabase Edge Function has no fixed egress IP to put on that list, so `POST
  /v3/smtp/email` answers `401 unrecognised IP address` no matter how correct the key is.
  The SMTP relay is not IP restricted, and it needs nothing more than a TCP socket and
  STARTTLS, which this runtime has - the Postgres connection is the same two primitives -
  so `server/smtpClient.js` is about 250 lines instead of a dependency. Two things about
  that session are easy to get wrong and both are checked by a test: the socket's `data`
  listener has to come off before `tls.connect({ socket })` and go back on the secure socket
  afterwards, or the plaintext reader eats the TLS records and the handshake times out
  looking like a dead relay; and `465` is a session wrapped from the first byte rather than
  `587` with a flag, so it is a separate mode and not a default. Whatever is
  configured is used, SMTP first when both are present, and an unreachable relay falls
  back to the API with both errors reported.
* `GET /api/email-test` is how a mail problem is diagnosed without reading function logs:
  it prints which transport is live, the length and hash of the key (never the key), and
  then asks the relay for the envelope - `MAIL FROM`, `RCPT TO`, `RSET`, `QUIT`, no `DATA`,
  so nothing is transmitted and no quota is spent - which is the only way to learn that
  the sender address is not verified. `?probe=0` answers without contacting anyone.
* `GET /api/auth-status` prints `emailVerificationRequired`, which is the only way to
  tell "this feature is on" from outside the app. It reads the same two conditions, so it
  cannot advertise a gate that `handleTursoRpc` is not actually enforcing.

To turn it on, two secrets in Supabase (the same place, same two clicks):
`BREVO_SENDER_EMAIL` set to the verified address, then `JATEXT_REQUIRE_EMAIL_VERIFICATION`
set to `1`. To turn it off, set the second one to `0`; accounts already sitting
unverified keep their flag, so verifying them later still works.

## Sign in with Google: removed

The Google button is gone from the iOS PWA login page and from the Android login
screen, and `api/oauth-google.js` answers before doing anything else: `?action=config`
reports `configured: false` (which is what makes an installed app show a message
instead of opening a browser tab that can never finish), `POST` returns 410, and
`?action=start` 302s back into the app with a readable `authError`. The flow behind that
check is untouched, so setting the edge secret `JATEXT_GOOGLE_DISABLED` to `0` brings it
straight back, keys and all. `api/auth-status.js` keeps `googleConfigured` false while the
switch is on, so the status page cannot send a reader looking for a bug that is not there.

Accounts already created through Google keep working: they sign in with their password,
and `google_sub` on the row is left alone. Nobody was ever signed in only through Google
on this server (`userCount: 0` when it was switched off), so there was nothing to migrate.

## Why there is no domain

`jatextapp.pages.dev` is the public origin on purpose. A `*.pages.dev` hostname is
already HTTPS, already behind Cloudflare's edge, needs no DNS record, no
certificate and no renewal, and it cannot be pointed at a machine that gets
switched off. Nothing in the app assumes a custom domain.

If a domain is ever wanted, two things have to move together: `PUBLIC_APP_ORIGIN`
in Supabase (which also changes the passkey relying party, so passkeys are
re-enrolled) and `API_ORIGIN` in `android/app/build.gradle`, which means a new APK
build. Doing one without the other is how an app ends up talking to a dead host.
