# JaText — Local Setup Guide (step by step)

This gets JaText running on **your own machine** with a real **convex.dev**
backend (account + database on dashboard.convex.dev). Total time: ~10–15 min.
Google login (Step 6) is optional — email/password works without it.

---

## What you need first

1. **Node.js 20 or newer** — download the **LTS** version from
   https://nodejs.org and install it (just click through the installer).
2. **A free Convex account** — sign up at https://convex.dev (top right →
   "sign in"; GitHub/Google login is fine).
3. This project folder (`jatext`) downloaded and unzipped somewhere,
   e.g. your Desktop.

Check Node worked — open a terminal and run:

```bash
node -v    # should print v20.x or higher
npm -v
```

> **Opening a terminal in the project folder**
> - **Windows:** open the `jatext` folder in File Explorer, click the
>   address bar, type `cmd`, press Enter. (Or right-click →
>   "Open in Terminal".)
> - **Mac:** right-click the `jatext` folder in Finder →
>   "New Terminal at Folder".
> - All commands below are run **inside the `jatext` folder**.

---

## Step 1 — Install dependencies

In the project folder terminal:

```bash
npm install
```

Wait for it to finish (1–2 minutes). This fills the `node_modules` folder.

## Step 2 — Connect Convex (creates your backend on convex.dev)

In the **same terminal**:

```bash
npx convex dev
```

What happens:
1. Your browser opens → **log in to convex.dev** → come back to the terminal.
2. It asks about a project — choose **"Create a new project"** and name it
   `jatext` (choose your personal team if asked).
3. It creates a `.env.local` file for you (with `VITE_CONVEX_URL`), generates
   `convex/_generated`, and uploads everything in the `convex/` folder
   (database tables, auth, chat functions) to your Convex deployment.
4. It then stays running and watches for changes.

✅ **Leave this terminal running.** This is your backend sync — you need it
open whenever you develop. (Tip: press `d` in this terminal to open your
Convex dashboard in the browser.)

## Step 3 — Set up auth keys (one time only)

Open a **second terminal** in the same folder (new window/tab) and run:

```bash
npx @convex-dev/auth
```

This is a setup wizard. Just go through it:
- **SITE_URL:** confirm / enter `http://localhost:5173`
- It generates your `JWT_PRIVATE_KEY` + `JWKS` and saves them to your Convex
  deployment automatically.
- For `auth.ts` / `http.ts` / `auth.config.ts` it will notice they're
  already set up (they are — JaText ships them) → just answer
  **"Ready to continue?" → yes** each time.

## Step 4 — Run the app

In that **second terminal**:

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

At the bottom of the login card you should see:

> *"Connected to your Convex deployment ⚡"*

If you see "Demo mode", jump to Troubleshooting below.

**From now on, developing = these two commands in two terminals:**

```bash
npx convex dev   # terminal 1 (backend)
npm run dev      # terminal 2 (frontend)
```

## Step 5 — Test it end to end

1. **Sign up** with an email + password → you get the
   *"Welcome to JaText!"* profile setup. Pick a username e.g. `test1`.
2. Go to https://dashboard.convex.dev → your `jatext` project →
   **Data → `users`** — you'll see your new user row. That's your live
   Convex database. 🎉
3. Open **http://localhost:5173 in an Incognito/Private window**, sign up a
   second account (e.g. `test2`), then:
   - Account 1: **Add friends** → add `@test2` → *Send friend request*
   - Account 2 (incognito): **Add friends** tab (red badge) → **Accept**
   - Chat between the two windows — texts + 📎 attachments appear instantly.

## Step 6 (optional) — Turn on "Continue with Google"

Skip this and email/password still works; only the Google button needs it.

1. Go to https://console.cloud.google.com → create/select a project
   (call it "JaText").
2. **APIs & Services → OAuth consent screen** → External → fill in app name
   `JaText` + your email → Save.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → *Web application*.
4. Under **Authorized redirect URIs** add exactly (get your site URL first
   with `npx convex env get CONVEX_SITE_URL` in a terminal — it looks like
   `https://happy-animal-123.convex.site`):

   ```
   https://happy-animal-123.convex.site/api/auth/callback/google
   ```

   (Quick shortcut: take your `VITE_CONVEX_URL` from `.env.local` and
   replace `.convex.cloud` with `.convex.site`, then add
   `/api/auth/callback/google`.)
5. Create it → copy the **Client ID** and **Client secret**, then run:

   ```bash
   npx convex env set AUTH_GOOGLE_ID     <paste-client-id>
   npx convex env set AUTH_GOOGLE_SECRET <paste-client-secret>
   ```

6. Refresh http://localhost:5173 → **Continue with Google** now works.
   (In Google's consent screen you may need to add your own Gmail under
   "Test users" while the app is in testing mode.)

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `'npm' is not recognized` / `command not found` | Node.js isn't installed or terminal is stale — install from nodejs.org, then **close & reopen** the terminal. |
| Windows PowerShell: *"npm.ps1 cannot be loaded…"* | Use **Command Prompt** instead (type `cmd` in the folder address bar), or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in PowerShell. |
| App says **"Demo mode"** on the login page | `npx convex dev` hasn't run/created `.env.local` yet, or you started `npm run dev` before it existed. Run Step 2, then **restart** `npm run dev` (Ctrl+C, run again). |
| *"Could not find public function users:current"* or chat won't load | Terminal 1 (`npx convex dev`) isn't running or still syncing — start it and wait for "Convex functions ready". |
| Google error `redirect_uri_mismatch` | The redirect URI in Google Cloud Console must match Step 6.4 **exactly** (no trailing slash). Wait a minute after saving. |
| Port 5173 already in use (vite starts on 5174) | Fine to use, but update the auth URL: `npx convex env set SITE_URL http://localhost:5174` |
| `npx convex dev` wants you to pick a deployment every time | Make sure you're in the `jatext` folder (it reads `.env.local` there). Don't delete `.env.local`. |

## Where things live (for later)

- Frontend: `src/` (login, onboarding, chat UI) · avatar colors in `src/lib/colors.ts`
- Convex backend: `convex/` (`schema.ts` tables, `users.ts`, `friends.ts`,
  `messages.ts`, `auth.ts`)
- Your data & uploaded files: https://dashboard.convex.dev → `jatext` →
  **Data** / **Files**
- Environment variables: Dashboard → Settings → Environment Variables,
  or `npx convex env list`

## Going to production later (not now)

```bash
npx convex deploy     # pushes backend to your prod deployment
npm run build         # builds the frontend (use the prod VITE_CONVEX_URL)
```

Then repeat Steps 3 & 6 against prod (`npx convex env --prod set ...`) with
`SITE_URL` = your real website address. See `README.md` for details.
