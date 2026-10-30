import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { env } from "./_generated/server";

const ANDROID_AUTH_CALLBACK = "com.ahad00010.jatext://auth";

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
  callbacks: {
    async redirect({ redirectTo }) {
      if (redirectTo === ANDROID_AUTH_CALLBACK) return ANDROID_AUTH_CALLBACK;
      const siteUrl = (env.SITE_URL ?? env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
      if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
        return `${siteUrl}${redirectTo}`;
      }
      if (siteUrl && redirectTo.startsWith(siteUrl)) {
        const suffix = redirectTo.slice(siteUrl.length);
        if (suffix === "" || suffix.startsWith("?") || suffix.startsWith("/")) {
          return redirectTo;
        }
      }
      throw new Error(`Invalid authentication redirect: ${redirectTo}`);
    },
  },
});
