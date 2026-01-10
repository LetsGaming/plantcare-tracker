
import fs from "fs"
import path from "path";
import vm from "vm";

const DEFAULT_LOCALES_DIR = path.resolve("src/locales");

function loadLocale(filePath) {
  const code = fs.readFileSync(filePath, "utf8");

  const wrapped = code.replace(
    /export\s+default/,
    "module.exports ="
  );

  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(wrapped, sandbox);

  return sandbox.module.exports;
}

function getLocaleFiles(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Locales directory not found: ${dir}`);
  }

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(dir, f));
}

function diff(a, b) {
  return a.filter((k) => !b.includes(k));
}

const localesDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : DEFAULT_LOCALES_DIR;

let localeFiles;
try {
  localeFiles = getLocaleFiles(localesDir);
} catch (err) {
  console.error("❌", err.message);
  process.exit(1);
}

if (localeFiles.length < 2) {
  console.error("❌ Need at least two locale files to compare.");
  process.exit(1);
}

const locales = {};
for (const file of localeFiles) {
  const name = path.basename(file);
  locales[name] = Object.keys(loadLocale(file)).sort();
}

const referenceName = localeFiles
  .map((f) => path.basename(f))
  .sort()[0];

const referenceKeys = locales[referenceName];

console.log("=== i18n Locale Key Check ===");
console.log(`Directory: ${localesDir}`);
console.log(`Reference: ${referenceName}`);
console.log("");

let hasErrors = false;

for (const [name, keys] of Object.entries(locales)) {
  if (name === referenceName) continue;

  const missing = diff(referenceKeys, keys);
  const extra = diff(keys, referenceKeys);

  if (missing.length || extra.length) {
    hasErrors = true;
    console.log(`❌ ${name}`);

    if (missing.length) {
      console.log("  Missing keys:");
      missing.forEach((k) => console.log("   -", k));
    }

    if (extra.length) {
      console.log("  Extra keys:");
      extra.forEach((k) => console.log("   +", k));
    }

    console.log("");
  }
}

if (!hasErrors) {
  console.log("✅ All locale files are in sync.");
  process.exit(0);
}

process.exit(2);
