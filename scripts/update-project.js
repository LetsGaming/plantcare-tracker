import { execSync, spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * CONFIGURATION
 * Author: { name: "LetsGamingDE", id: 272402865874534400n}
 */
const TARGETS = ["./frontend", "./backend"];
const DEV_CHECK_DURATION = 10000;
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

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

function getVulnerabilityCount(cwd) {
  try {
    const result = spawnSync("npm", ["audit", "--json"], {
      cwd,
      encoding: "utf8",
    });
    const auditData = JSON.parse(result.stdout || "{}");
    if (auditData.metadata && auditData.metadata.vulnerabilities) {
      const v = auditData.metadata.vulnerabilities;
      return v.low + v.moderate + v.high + v.critical;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

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

function killTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } catch (e) {}
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (e) {
      try {
        child.kill("SIGKILL");
      } catch (err) {}
    }
  }
}

async function testDevServer(cwd) {
  return new Promise((resolve) => {
    log.info(`Starting smoke test (${DEV_CHECK_DURATION / 1000}s)...`);
    const child = spawn("npm", ["run", "dev"], {
      cwd,
      shell: true,
      detached: process.platform !== "win32",
      stdio: "pipe",
    });

    let isResolved = false;
    child.on("error", () => {
      if (!isResolved) {
        isResolved = true;
        resolve(false);
      }
    });
    child.on("exit", (code) => {
      if (!isResolved) {
        isResolved = true;
        if (code !== 0 && code !== null)
          log.error(`Dev server crashed (code ${code})`);
        resolve(false);
      }
    });

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        log.success("Dev server stable.");
        killTree(child);
        resolve(true);
      }
    }, DEV_CHECK_DURATION);
    timer.unref();
  });
}

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
      if (fs.existsSync(fullPath))
        this.backups.set(file, fs.readFileSync(fullPath));
    }
  }

  rollback() {
    log.warn(`Rolling back changes in ${path.basename(this.cwd)}...`);
    for (const [file, content] of this.backups) {
      fs.writeFileSync(path.join(this.cwd, file), content);
    }
    log.step("Restoring original state...");
    runSync("npm install", this.cwd);
  }
}

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
    // 1. Version Updates (Added --peer to respect peer dependencies)
    log.info("Checking for dependency updates (respecting peers)...");
    if (!runSync("npx npm-check-updates -u --peer", fullPath)) {
      throw new Error("NCU failed.");
    }

    // 2. Installation & Security Strategy Ladder
    let installSuccess = false;
    const strategies = [
      { name: "Standard Install", cmd: "npm install" },
      { name: "Legacy Peer Install", cmd: "npm install --legacy-peer-deps" },
      { name: "Security Patching", cmd: "npm audit fix" },
      {
        name: "Clean Install & Audit",
        cmd: "npm install --legacy-peer-deps && npm audit fix",
        pre: (p) => {
          const nm = path.join(p, "node_modules");
          const pl = path.join(p, "package-lock.json");
          if (fs.existsSync(nm))
            fs.rmSync(nm, { recursive: true, force: true });
          if (fs.existsSync(pl)) fs.unlinkSync(pl);
        },
      },
    ];

    for (const strategy of strategies) {
      log.info(`Attempting: ${strategy.name}`);
      if (strategy.pre) strategy.pre(fullPath);

      if (runSync(strategy.cmd, fullPath)) {
        const vulnCount = getVulnerabilityCount(fullPath);
        if (vulnCount === 0) {
          log.success("Clean installation verified (0 vulnerabilities).");
          installSuccess = true;
          break;
        } else {
          log.warn(`Found ${vulnCount} vulnerabilities. Escalating...`);
        }
      }
    }

    if (!installSuccess) {
      log.warn(
        "Could not reach 0 vulnerabilities, but proceeding to smoke test with current state.",
      );
    }

    // 3. Smoke Test
    const isStable = await testDevServer(fullPath);
    if (!isStable) throw new Error("Build is unstable after updates/fixes.");

    log.success(`${path.basename(targetPath)} updated and verified.`);
  } catch (error) {
    log.error(error.message);
    guard.rollback();
  }
}

(async () => {
  process.on("SIGINT", () => {
    log.warn("\nInterrupted. Exiting...");
    process.exit(1);
  });

  for (const target of TARGETS) {
    await updateProject(target);
  }
  log.header("ALL OPERATIONS COMPLETE");
})();
