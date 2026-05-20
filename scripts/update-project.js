import { execSync, spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * CONFIGURATION
 */
const DEV_CHECK_DURATION = 10000;
const IGNORE_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "vendor",
];

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

/**
 * Detects which package manager to use based on lockfiles
 */
function detectManager(cwd) {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Finds all directories containing a package.json
 */
function findNpmProjects(dir, projects = []) {
  const files = fs.readdirSync(dir);
  if (files.includes("package.json")) {
    projects.push(dir);
  }
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (
      fs.statSync(fullPath).isDirectory() &&
      !IGNORE_DIRS.includes(file) &&
      !file.startsWith(".")
    ) {
      findNpmProjects(fullPath, projects);
    }
  }
  return projects;
}

function getVulnerabilityCount(cwd, manager) {
  try {
    const result = spawnSync(manager, ["audit", "--json"], {
      cwd,
      encoding: "utf8",
    });
    const auditData = JSON.parse(result.stdout || "{}");

    if (manager === "npm" && auditData.metadata?.vulnerabilities) {
      const v = auditData.metadata.vulnerabilities;
      return v.low + v.moderate + v.high + v.critical;
    }
    if (manager === "pnpm" && auditData.metadata?.vulnerabilities) {
      const v = auditData.metadata.vulnerabilities;
      return (v.low ?? 0) + (v.moderate ?? 0) + (v.high ?? 0) + (v.critical ?? 0);
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Returns manager-specific install strategies, in order of preference.
 * Each strategy is tried until one succeeds with zero vulnerabilities.
 */
function getInstallStrategies(manager) {
  switch (manager) {
    case "pnpm":
      return [
        { name: "Default Install", cmd: "pnpm install" },
        // pnpm's equivalent of --legacy-peer-deps: ignore peer dep conflicts
        { name: "No Strict Peer Install", cmd: "pnpm install --no-strict-peer-dependencies" },
      ];
    case "yarn":
      return [
        { name: "Default Install", cmd: "yarn install" },
        // Yarn 1: ignore engines/peer; Yarn Berry: --mode=skip-build is safer but less relevant
        { name: "Ignore Engines Install", cmd: "yarn install --ignore-engines" },
      ];
    case "npm":
    default:
      return [
        { name: "Default Install", cmd: "npm install" },
        { name: "Legacy Peer Install", cmd: "npm install --legacy-peer-deps" },
        // audit fix only makes sense after a successful install (lockfile exists)
        { name: "Security Patch", cmd: "npm audit fix" },
      ];
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

async function testProject(cwd, manager) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(cwd, "package.json"), "utf8"),
  );

  // Dynamic script detection priority: dev -> start -> test
  const testScript = ["dev", "start", "test"].find(
    (s) => pkg.scripts && pkg.scripts[s],
  );

  if (!testScript) {
    log.warn("No suitable test/dev script found. Skipping smoke test.");
    return true;
  }

  return new Promise((resolve) => {
    log.info(`Smoke testing via '${manager} run ${testScript}'...`);
    const child = spawn(manager, ["run", testScript], {
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
          log.error(`Process exited with code ${code}`);
        resolve(false);
      }
    });

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        log.success(`Project is stable under '${testScript}'.`);
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
    this.files = [
      "package.json",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
    ];
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

  rollback(manager) {
    log.warn(`Rolling back changes...`);
    for (const [file, content] of this.backups) {
      fs.writeFileSync(path.join(this.cwd, file), content);
    }
    runSync(`${manager} install`, this.cwd);
  }
}

async function updateProject(fullPath) {
  const manager = detectManager(fullPath);
  log.header(
    `Project: ${path.relative(process.cwd(), fullPath) || "Root"} [using ${manager}]`,
  );

  const guard = new ProjectGuard(fullPath);
  guard.backup();

  try {
    // 1. Update Dependencies
    log.info("Updating dependencies...");
    if (!runSync("npx npm-check-updates -u --peer", fullPath)) {
      throw new Error("NCU failed.");
    }

    // 2. Install — try manager-specific strategies in order, stop at first clean success
    let installSuccess = false;
    const strategies = getInstallStrategies(manager);

    for (const strategy of strategies) {
      log.info(`Attempting: ${strategy.name}`);
      if (runSync(strategy.cmd, fullPath)) {
        const vulnCount = getVulnerabilityCount(fullPath, manager);
        if (vulnCount === 0) {
          log.success("Installation clean.");
          installSuccess = true;
          break;
        } else {
          log.warn(`${vulnCount} vulnerabilit${vulnCount === 1 ? "y" : "ies"} found, trying next strategy...`);
        }
      }
    }

    // Gate smoke test on a successful install
    if (!installSuccess) {
      throw new Error("All install strategies failed or vulnerabilities remain.");
    }

    // 3. Dynamic Smoke Test
    const isStable = await testProject(fullPath, manager);
    if (!isStable) throw new Error("Project failed stability check.");

    log.success("Project updated and verified.");
  } catch (error) {
    log.error(error.message);
    guard.rollback(manager);
  }
}

(async () => {
  process.on("SIGINT", () => {
    log.warn("\nInterrupted. Exiting...");
    process.exit(1);
  });

  const projects = findNpmProjects(process.cwd());
  log.info(`Found ${projects.length} project(s).`);

  for (const projectPath of projects) {
    await updateProject(projectPath);
  }
  log.header("ALL OPERATIONS COMPLETE");
})();