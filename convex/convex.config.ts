import { defineApp } from "convex/server";
import { v } from "convex/values";

export default defineApp({
  env: {
    KLIPY_API_KEY: v.optional(v.string()),
    FCM_SERVICE_ACCOUNT_JSON: v.optional(v.string()),
  },
});
