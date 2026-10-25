import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * JaText sign-in options:
 * 1. Google OAuth  — needs AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
 *    (set them in the Convex dashboard → Settings → Environment Variables)
 * 2. Normal email + password sign up / sign in
 *
 * First-time setup: `npx @convex-dev/auth` (sets JWT keys + SITE_URL).
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, Password],
});
