import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Vite 8 needs Node 20.19+ / 22.12+, and a host that defaults to an older Node
// (Cloudflare Pages does, unless the repo pins a version) fails inside Vite with a
// message that points nowhere near the real cause. Say it up front instead.
{
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20 || (major === 20 && minor < 19)) {
    console.error(
      `Node ${process.versions.node} is too old for this build (needs >= 20.19 or >= 22.12). ` +
        `Set NODE_VERSION=22 as an environment variable on the hosting side.`,
    );
    process.exit(1);
  }
}

execSync("npx tsc -b && npx vite build", { stdio: "inherit" });

// Stamp dist/web-version.json with a unique build identifier so installed iOS PWAs
// detect every fresh Vercel deployment and prompt users to refresh immediately.
let commitSha = process.env.VERCEL_GIT_COMMIT_SHA || "";
if (!commitSha) {
  try {
    commitSha = execSync("git rev-parse --short=10 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    commitSha = "release";
  }
} else {
  commitSha = commitSha.slice(0, 10);
}

let pkgVersion = "3.8.0";
try {
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  if (pkg?.version) pkgVersion = String(pkg.version);
} catch {
  // ignore
}

const publishedAt = new Date().toISOString();
const webVersionManifest = {
  version: pkgVersion,
  packageVersion: pkgVersion,
  buildId: `${commitSha}-${Date.now()}`,
  commitSha,
  publishedAt,
};
writeFileSync(
  resolve("dist/web-version.json"),
  `${JSON.stringify(webVersionManifest, null, 2)}\n`,
  "utf8",
);
console.log(`Wrote dist/web-version.json (${webVersionManifest.buildId})`);

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
