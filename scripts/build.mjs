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

// Publish the version manifest beside the site, so the in-app updater and the
// landing page read the newest version from the origin they were served from.
//
// The APK itself is deliberately NOT copied in. Cloudflare Pages refuses any
// single asset over 25 MB, a signed release APK is about 50 MB, and the whole
// deployment fails over it. The download link lives in the manifest and points at
// the GitHub Release the same workflow publishes, which has no such limit.
const manifestSrc = resolve("release-cdn/apk-version.json");
const apkSrc = resolve("release-cdn/JaText-release.apk");

if (existsSync(manifestSrc)) {
  copyFileSync(manifestSrc, resolve("dist/apk-version.json"));
  console.log("Copied release-cdn/apk-version.json -> dist/apk-version.json");
}

if (existsSync(apkSrc)) {
  console.log(
    "Left release-cdn/JaText-release.apk out of the site: it is larger than the " +
      "25 MB per asset limit. The download URL in apk-version.json is used instead.",
  );
}
