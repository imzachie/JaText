import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.CONVEX_DEPLOY_KEY) {
  try {
    console.log("CONVEX_DEPLOY_KEY detected — deploying Convex functions...");
    execSync("npx convex deploy --yes", { stdio: "inherit" });
  } catch (err) {
    console.warn("Convex deploy step failed; continuing frontend build:", err);
  }
}

execSync("npx tsc -b && npx vite build", { stdio: "inherit" });

// Publish release-cdn/* into dist/ ONLY on web builds (Vercel), keeping Android APK bundles lean!
const manifestSrc = resolve("release-cdn/apk-version.json");
const apkSrc = resolve("release-cdn/JaText-release.apk");

if (existsSync(manifestSrc)) {
  copyFileSync(manifestSrc, resolve("dist/apk-version.json"));
  console.log("Copied release-cdn/apk-version.json -> dist/apk-version.json");
}

if (existsSync(apkSrc)) {
  mkdirSync(resolve("dist/downloads"), { recursive: true });
  copyFileSync(apkSrc, resolve("dist/downloads/JaText-release.apk"));
  console.log("Copied release-cdn/JaText-release.apk -> dist/downloads/JaText-release.apk");
}
