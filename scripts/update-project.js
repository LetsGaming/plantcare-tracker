import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

const targets = ["../frontend", "../backend"];
const DEV_CHECK_DURATION = 10000; // 10 seconds to verify dev server stability

/**
 * Executes a sync command (for installs/updates)
 */
function runSync(command, cwd) {
  try {
    console.log(`\x1b[90mRunning: ${command}\x1b[0m`);
    execSync(command, { stdio: "inherit", cwd });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Runs the dev server, waits to see if it crashes, then kills it.
 */
async function testDevServer(cwd) {
  return new Promise((resolve) => {
    console.log(
      `\x1b[34mStarting dev server for ${DEV_CHECK_DURATION / 1000}s smoke test...\x1b[0m`,
    );

    const child = spawn("npm", ["run", "dev"], {
      cwd,
      shell: true,
      stdio: "pipe", // Pipe to watch for specific error strings if needed
    });

    let crashed = false;

    child.on("error", (err) => {
      crashed = true;
      resolve(false);
    });

    // If the process exits early, it likely crashed
    child.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        crashed = true;
        resolve(false);
      }
    });

    // Set a timer to kill the process after success duration
    setTimeout(() => {
      if (!crashed) {
        console.log("\x1b[32m✔ Dev server seems stable.\x1b[0m");
        // Force kill the process tree (important on Windows)
        if (process.platform === "win32") {
          execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
        } else {
          child.kill();
        }
        resolve(true);
      }
    }, DEV_CHECK_DURATION);
  });
}

async function updateProject(targetPath) {
  const fullPath = path.resolve(targetPath);
  console.log(`\n\x1b[36m=== Processing: ${targetPath} ===\x1b[0m`);

  if (!fs.existsSync(fullPath)) {
    console.log(`\x1b[33mDirectory ${targetPath} not found. Skipping.\x1b[0m`);
    return;
  }

  // 1. Update package.json versions
  console.log("Checking for package updates...");
  runSync("npx npm-check-updates -u", fullPath);

  // 2. Attempt Strategy Ladder
  let success = false;

  // Attempt 1: Normal Install
  console.log("\x1b[32mAttempt 1: Standard npm install...\x1b[0m");
  if (runSync("npm install", fullPath)) {
    success = true;
  }

  // Attempt 2: Clean Slate (The "Nuclear" option for ERESOLVE)
  if (!success) {
    console.log(
      "\x1b[33mAttempt 1 failed. Attempt 2: Cleaning lockfile/modules and retrying...\x1b[0m",
    );

    const lockFile = path.join(fullPath, "package-lock.json");
    const nodeModules = path.join(fullPath, "node_modules");

    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    if (fs.existsSync(nodeModules))
      fs.rmSync(nodeModules, { recursive: true, force: true });

    if (runSync("npm install", fullPath)) {
      success = true;
    }
  }

  // Attempt 3: Legacy Peer Deps
  if (!success) {
    console.log(
      "\x1b[35mAttempt 2 failed. Attempt 3: Using --legacy-peer-deps...\x1b[0m",
    );
    if (runSync("npm install --legacy-peer-deps", fullPath)) {
      success = true;
    }
  }

  // 3. Final Verification: Dev Server Test
  if (success) {
    console.log(
      `\x1b[32m✔ Successfully installed dependencies for ${targetPath}\x1b[0m`,
    );

    const devWorks = await testDevServer(fullPath);
    if (!devWorks) {
      console.log(
        `\x1b[31m✘ Dependencies installed, but "npm run dev" CRASHED in ${targetPath}.\x1b[0m`,
      );
    }
  } else {
    console.log(
      `\x1b[41m\x1b[37m CRITICAL: Could not resolve dependencies for ${targetPath} after all attempts. \x1b[0m`,
    );
    process.exit(1);
  }
}

// Main Execution
(async () => {
  for (const target of targets) {
    await updateProject(target);
  }
  console.log("\n\x1b[36mAll operations finished.\x1b[0m");
  process.exit(0);
})();
