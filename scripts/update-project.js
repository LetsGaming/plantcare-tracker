import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

/**
 * CONFIGURATION
 */
const TARGETS = ["../frontend", "../backend"];
const DEV_CHECK_DURATION = 10000; // 10 seconds
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

/**
 * LOGGING UTILITY
 */
const log = {
  info: (msg) => console.log(`${COLORS.cyan}ℹ ${msg}${COLORS.reset}`),
  success: (msg) => console.log(`${COLORS.green}✔ ${msg}${COLORS.reset}`),
  warn: (msg) => console.log(`${COLORS.yellow}⚠ ${msg}${COLORS.reset}`),
  error: (msg) => console.log(`${COLORS.red}✘ ${msg}${COLORS.reset}`),
  step: (msg) => console.log(`${COLORS.gray}  → ${msg}${COLORS.reset}`),
  header: (msg) =>
    console.log(
      `\n${COLORS.bright}${COLORS.blue}=== ${msg} ===${COLORS.reset}`,
    ),
};

/**
 * Executes a sync command with inherited stdio.
 */
function runSync(command, cwd) {
  try {
    log.step(`Running: ${command}`);
    execSync(command, {
      stdio: "inherit",
      cwd,
      env: { ...process.env, FORCE_COLOR: "true" },
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Kills a process tree reliably across platforms.
 */
function killTree(child) {
  if (!child || !child.pid) return;

  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } catch (e) {
      /* process already dead */
    }
  } else {
    try {
      // Use negative PID to kill the process group
      process.kill(-child.pid, "SIGKILL");
    } catch (e) {
      try {
        child.kill("SIGKILL");
      } catch (err) {
        /* ignore */
      }
    }
  }
}

/**
 * Runs dev server smoke test by monitoring the process for stability.
 */
async function testDevServer(cwd) {
  return new Promise((resolve) => {
    log.info(`Starting smoke test (${DEV_CHECK_DURATION / 1000}s)...`);

    // Use detached: true and stdio: 'pipe' to allow us to kill the whole group later
    const child = spawn("npm", ["run", "dev"], {
      cwd,
      shell: true,
      detached: process.platform !== "win32",
      stdio: "pipe",
    });

    let isResolved = false;

    // Monitor for early crashes
    child.on("error", (err) => {
      if (!isResolved) {
        isResolved = true;
        log.error(`Failed to start: ${err.message}`);
        resolve(false);
      }
    });

    child.on("exit", (code) => {
      if (!isResolved) {
        isResolved = true;
        if (code !== 0 && code !== null) {
          log.error(`Dev server crashed with code ${code}`);
        }
        resolve(false);
      }
    });

    // If it survives the duration, it's considered stable
    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        log.success("Dev server reached stability threshold.");
        killTree(child);
        resolve(true);
      }
    }, DEV_CHECK_DURATION);

    // Ensure the script doesn't hang if this is the only thing left
    timer.unref();
  });
}

/**
 * Handles file backups and atomic restoration.
 */
class ProjectGuard {
  constructor(cwd) {
    this.cwd = cwd;
    this.files = ["package.json", "package-lock.json"];
    this.backups = new Map();
  }

  backup() {
    log.step("Creating safety backups...");
    for (const file of this.files) {
      const fullPath = path.join(this.cwd, file);
      if (fs.existsSync(fullPath)) {
        this.backups.set(file, fs.readFileSync(fullPath));
      }
    }
  }

  rollback() {
    log.warn(`Rolling back changes in ${path.basename(this.cwd)}...`);
    for (const [file, content] of this.backups) {
      fs.writeFileSync(path.join(this.cwd, file), content);
    }
    log.step("Re-installing original dependencies...");
    runSync("npm install", this.cwd);
  }
}

/**
 * Main logic for a single project directory.
 */
async function updateProject(targetPath) {
  const fullPath = path.resolve(targetPath);
  log.header(`Processing: ${path.basename(fullPath)}`);

  if (!fs.existsSync(fullPath)) {
    log.warn(`Directory ${targetPath} not found. Skipping.`);
    return;
  }

  const guard = new ProjectGuard(fullPath);
  guard.backup();

  try {
    // 1. Update package.json versions
    log.info("Checking for dependency updates...");
    const ncuSuccess = runSync("npx npm-check-updates -u", fullPath);
    if (!ncuSuccess) {
      throw new Error("Failed to update package.json with NCU.");
    }

    // 2. Strategy Ladder
    let installSuccess = false;
    const strategies = [
      { name: "Standard Install", cmd: "npm install" },
      {
        name: "Clean Install (Hard Reset)",
        cmd: "npm install",
        pre: (p) => {
          const nm = path.join(p, "node_modules");
          const pl = path.join(p, "package-lock.json");
          if (fs.existsSync(nm))
            fs.rmSync(nm, { recursive: true, force: true });
          if (fs.existsSync(pl)) fs.unlinkSync(pl);
        },
      },
      { name: "Legacy Peer Deps", cmd: "npm install --legacy-peer-deps" },
    ];

    for (const strategy of strategies) {
      log.info(`Attempting Strategy: ${strategy.name}`);
      if (strategy.pre) strategy.pre(fullPath);

      if (runSync(strategy.cmd, fullPath)) {
        installSuccess = true;
        break;
      }
      log.warn(`${strategy.name} failed. Trying next...`);
    }

    if (!installSuccess) throw new Error("All installation strategies failed.");

    // 3. Smoke Test
    const isStable = await testDevServer(fullPath);
    if (!isStable) throw new Error("Project failed smoke test after update.");

    log.success(
      `${path.basename(targetPath)} updated and verified successfully.`,
    );
  } catch (error) {
    log.error(error.message);
    guard.rollback();
  }
}

/**
 * CLI Entry Point
 */
(async () => {
  // Handle Ctrl+C
  process.on("SIGINT", () => {
    console.log(
      `\n${COLORS.yellow}Interrupted by user. Cleaning up...${COLORS.reset}`,
    );
    process.exit(1);
  });

  for (const target of TARGETS) {
    await updateProject(target);
  }

  log.header("ALL OPERATIONS COMPLETE");
})();
