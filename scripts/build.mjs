import { execSync } from "node:child_process";

if (process.env.CONVEX_DEPLOY_KEY) {
  try {
    console.log("CONVEX_DEPLOY_KEY detected — deploying Convex functions...");
    execSync("npx convex deploy --yes", { stdio: "inherit" });
  } catch (err) {
    console.warn("Convex deploy step failed; continuing frontend build:", err);
  }
}

execSync("npx tsc -b && npx vite build", { stdio: "inherit" });
