import { defineApp } from "convex/server";
import { v } from "convex/values";

export default defineApp({
  env: {
    KLIPY_API_KEY: v.optional(v.string()),
    FCM_SERVICE_ACCOUNT_JSON: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    AUTH_GOOGLE_ID: v.optional(v.string()),
    AUTH_GOOGLE_SECRET: v.optional(v.string()),
    JWT_PRIVATE_KEY: v.optional(v.string()),
    JWKS: v.optional(v.string()),
    AUTH_SECRET: v.optional(v.string()),
    AUTH_URL: v.optional(v.string()),
    AUTH_TRUST_HOST: v.optional(v.string()),
    AUTH_REDIRECT_PROXY_URL: v.optional(v.string()),
  },
});
