# JaText 💬

A texting app with Google / email sign-in, friend requests, customizable
profiles, and real-time chat with attachments — powered by **Convex**
(database, auth, and file storage via the Convex API).

## Features

- **Sign in with Google** or **normal email + password** (Convex Auth)
- **First-time welcome flow** — "Welcome to JaText! Who wouldn't want a
  beautiful profile picture?":
  - circle profile picture + banner upload
  - display name, **username (can only be changed every 14 days)**
  - bio + pronouns
  - **avatar color** — becomes the outline + background color behind your
    pfp on your profile card (e.g. Yellow 💛). Includes **`Default (Black)`**
    — *if.. ur boring* 😴
- Everything (except the 14-day username rule) can be changed any time in
  ** ⚙️ Settings**
- **Add friends by username** → they get a **friend request** → they
  **accept** → then you can chat
- **Real-time texting + photo/file attachments** through Convex queries,
  mutations, and Convex file storage
- **Message actions** — right-click for replies, forwarding, emoji reactions,
  copy, delete-for-me, favourite media, and one-hour unsend for your own
  messages
- **GIFs and stickers** — Klipy search, personal favourites and recent items,
  image/GIF uploads, and right-click-to-favourite from chat
- **Conversation actions** — right-click a chat to archive, mute, or clear your
  own chat history
- **Typing indicators and presence** — online, automatic away, Do Not Disturb,
  or persistent offline, with an optional custom status
- **Message alerts and sounds** — in-app and browser notifications plus
  configurable send/receive sounds
- **Message delivery and blocking** — Delivered while waiting for a recipient,
  Sent when their app receives it, Read when they open the chat; blocked
  senders' messages stay Delivered and are hidden from the blocker
- Click anyone's pfp to see their **profile card** (banner, bio, pronouns,
  avatar color)

## Quick start (demo mode — no setup)

```bash
npm install
npm run dev
```

With no Convex URL configured, JaText runs in **demo mode**: an identical
API implemented in the browser so every feature works instantly. Demo users
`@maya`, `@kai.codes`, and `@Nova` accept friend requests and text you back.

## Going live with your Convex deployment

1. **Create the deployment** (opens the Convex dashboard, creates your
   project, and writes `VITE_CONVEX_URL` to `.env.local`):

   ```bash
   npx convex dev
   ```

   Leave it running — it syncs the functions in `/convex` (schema, users,
   friends, messages) to your deployment. Press `d` anytime to open the
   dashboard and browse your data.

2. **Set up Convex Auth keys** (one-time wizard — sets `JWT_PRIVATE_KEY`,
   `JWKS`, and `SITE_URL` on the deployment):

   ```bash
   npx @convex-dev/auth
   ```

3. **Google sign-in** — in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   create an **OAuth 2.0 Web client** and add this authorized redirect URI
   (find your site URL with `npx convex env get CONVEX_SITE_URL` — usually
   `https://<your-deployment>.convex.site`):

   ```
   https://<your-deployment>.convex.site/api/auth/callback/google
   ```

   Then set the credentials on Convex (or via Dashboard → Settings →
   Environment Variables):

   ```bash
   npx convex env set AUTH_GOOGLE_ID <client-id>
   npx convex env set AUTH_GOOGLE_SECRET <client-secret>
   ```

   Email + password sign-in needs nothing extra.

4. **Run the app**:

   ```bash
   npm run dev        # frontend (vite)
   npx convex dev     # backend sync (keep running in another terminal)
   ```

   JaText detects `VITE_CONVEX_URL` and automatically switches from demo
   mode to your real Convex backend — same UI, real data.

## How it maps to Convex

| Feature | Convex function |
| --- | --- |
| Google / email auth | `convex/auth.ts` (Convex Auth: `Google` + `Password`) |
| Profile + onboarding + 14-day username rule | `convex/users.ts` → `current`, `checkUsername`, `saveProfile` |
| Friend requests / friends list | `convex/friends.ts` → `sendRequest`, `respond`, `listIncoming`, `listOutgoing`, `listFriends` |
| Texting and chat actions | `convex/messages.ts` → `send`, `list`, `previews`, `updateConversation` |
| Attachments & profile photos | `convex/messages.ts` → `generateUploadUrl` (Convex file storage) |
| Klipy GIF search and sticker library | `convex/klipy.ts` and `convex/stickers.ts` |
| Blocking users | `convex/blocks.ts` |
| Database tables | `convex/schema.ts` → `users`, `friendRequests`, `messages`, `conversationSettings`, `userBlocks`, `stickerLibrary` (+ auth tables) |

The frontend has one data interface (`src/lib/types.ts` → `JaTextStore`)
with two implementations: `src/lib/convexStore.tsx` (real Convex) and
`src/lib/store.tsx` (demo). Avatar colors live in `src/lib/colors.ts`.

## Building the Android app

JaText uses Capacitor to package the existing React/Vite app in an Android
WebView. The screens, styles, and chat code stay in `src/`; there is no
separate Android UI to copy or maintain.

1. Install Android Studio, including its Android SDK, and install a compatible
   JDK (JDK 21). Open Android Studio once and let it finish installing SDK
   components.
2. Android builds use the production Convex deployment configured in
   `.env.android`, so friends, requests, and conversations use the live
   production account data. Vite embeds this public URL into the APK at build
   time.
3. Build and open the native project:

   ```bash
   npm run android:sync
   npm run android:open
   ```

   In Android Studio, wait for Gradle sync, then choose **Build → Build
   Bundle(s) / APK(s) → Build APK(s)**. The debug APK is written to
   `android/app/build/outputs/apk/debug/app-debug.apk`.

   On Windows, you can instead run `npm run android:apk` after Android Studio
   has configured the SDK. It builds the web app, syncs it into Android, and
   assembles the debug APK.

   To build a signed release APK, first create a private release keystore and
   save its settings in the ignored `android/keystore.properties` file:

   ```properties
   storeFile=jatext-release.jks
   storePassword=YOUR_PRIVATE_STORE_PASSWORD
   keyAlias=jatext
   keyPassword=YOUR_PRIVATE_KEY_PASSWORD
   ```

   Keep both this file and `android/jatext-release.jks` backed up securely;
   Android updates must be signed with the same key. Then run
   `npm run android:release`. The APK is written to
   `android/app/build/outputs/apk/release/app-release.apk`.

The APK uses the same UI as the website, but it is a native WebView wrapper,
not a fully native rewrite. To enable remote Android push notifications:

1. Register an Android app with application ID `com.ahad00010.jatext` in your
   Firebase project, enable Firebase Cloud Messaging, and put its
   `google-services.json` at `android/app/google-services.json`. This local
   file is git-ignored.
2. In Firebase Console → **Project settings → Service accounts**, generate a
   Firebase Admin SDK private key with permission to send Firebase Cloud
   Messaging messages. Keep this private JSON file outside the repo.
3. Set the service-account JSON as a secret on the Convex deployment used by
   the APK. In PowerShell, replace the file path with the downloaded key:

   ```powershell
   $fcmCredentials = Get-Content -Raw "$env:USERPROFILE\Downloads\jatext-firebase-admin.json"
   npx convex env set FCM_SERVICE_ACCOUNT_JSON $fcmCredentials
   ```

4. Deploy the Convex functions, then rebuild the APK:

   ```bash
   npx convex deploy
   npm run android:apk
   ```

   Users can then enable **Push notifications when JaText is closed** in
   Settings. FCM displays received messages while the app is backgrounded or
   closed; tapping a push opens that sender's conversation.

To troubleshoot delivery, open **Logs** for the same Convex deployment used by
the APK and send a test message to the affected account. The
`FCM push accepted for all registered devices` log means Firebase accepted the
send; `FCM push delivery had failures` lists each failed device ID and Firebase
error code. `FCM push request failed` indicates a request-level configuration
or connection error, and `FCM push skipped` means the recipient has no
registered devices. These logs never include device tokens. The logged
`projectId` must match the Firebase project configured in
`android/app/google-services.json`.
On Android, **Settings → Activity & notifications → Repair push registration**
requests a fresh token for the currently signed-in account and shows whether the
server accepted it. The app also refreshes registration when it returns to the
foreground.

Android Google sign-in opens the system browser and returns to JaText through
the `com.ahad00010.jatext://auth` deep link. The Google OAuth web client must
continue using the Convex callback URL documented below.

## Deploying to production

Set the Klipy API key as a Convex environment variable (never expose it in
frontend environment variables):

```bash
npx convex env set KLIPY_API_KEY <api-key>
```

Run this for each deployment you use, including production.

```bash
npx convex deploy            # pushes backend to prod deployment
```

Then set `SITE_URL` (your real frontend URL) and the Google env vars on the
**prod** deployment, add the prod redirect URI in Google Cloud Console,
and build the frontend with the prod `VITE_CONVEX_URL`:

```bash
npm run build
```
