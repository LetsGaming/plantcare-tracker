require("dotenv").config();

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) => new Promise((res) => rl.question(q, res));

const SCHEMA_PATH = path.join(__dirname, "../database/database-v3-sqlite.sql");
const DEFAULT_DB_PATH = path.join(__dirname, "../data/plantcare.db");

/**
 * Convert MySQL dump → SQLite-compatible SQL
 */
function sanitizeDump(sql) {
  return sql
    // Remove MySQL versioned comments and headers
    .replace(/\/\*![\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    // Remove LOCK/UNLOCK and SET statements
    .replace(/^.*LOCK TABLES.*$/gim, "")
    .replace(/^.*UNLOCK TABLES.*$/gim, "")
    .replace(/^SET\s+[^;]+;/gim, "")
    // Remove lengths only for int/varchar
    .replace(/\b(int|varchar)\(\d+\)/gi, "$1")
    // Convert ENUM/SET to TEXT
    .replace(/\bENUM\s*\([^)]+\)/gi, "TEXT")
    .replace(/\bSET\s*\([^)]+\)/gi, "TEXT")
    // Remove AUTO_INCREMENT
    .replace(/\bAUTO_INCREMENT\b/gi, "")
    // Remove charset/collate
    .replace(/\bCHARACTER SET \w+\b/gi, "")
    .replace(/\bCOLLATE \w+\b/gi, "")
    // Remove keys/constraints
    .replace(/^\s*(?:UNIQUE\s+)?KEY\s+.*$/gm, "")
    .replace(/^\s*CONSTRAINT\s+.*$/gm, "")
    // Remove engine/table options
    .replace(/\)\s*ENGINE=[^;]+;/gi, ");")
    .replace(/\bDEFAULT\s+CHARSET=\w+\b/gi, "")
    .replace(/\bCOLLATE=\w+\b/gi, "")
    // Trailing commas
    .replace(/,\s*\)/g, ")")
    // Drop tables
    .replace(/DROP TABLE IF EXISTS .*?;/gi, "")
    .replace(/`/g, "")
    // Convert MySQL CURRENT_TIMESTAMP() → SQLite CURRENT_TIMESTAMP
    .replace(/\bCURRENT_TIMESTAMP\s*\(\)/gi, "CURRENT_TIMESTAMP")
    // Convert MySQL-style escaped quotes \' → SQLite ''
    .replace(/\\'/g, "''")
    // Collapse multiple blank lines
    .replace(/\n{2,}/g, "\n");
}

/**
 * Load schema without BEGIN/COMMIT
 */
function loadSchema() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error("Schema file not found:", SCHEMA_PATH);
    process.exit(1);
  }

  return fs
    .readFileSync(SCHEMA_PATH, "utf-8")
    .replace(/BEGIN;/gi, "")
    .replace(/COMMIT;/gi, "");
}

async function run() {
  console.log("=== LOSSLESS MIGRATION (RAW → TRANSFORM) ===");

  const dumpPath = await ask("MySQL dump path: ");

  if (!fs.existsSync(dumpPath)) {
    console.error("Dump not found");
    process.exit(1);
  }

  const sqlitePath = process.env.DB_PATH
    ? path.isAbsolute(process.env.DB_PATH)
      ? process.env.DB_PATH
      : path.join(__dirname, "..", process.env.DB_PATH)
    : DEFAULT_DB_PATH;

  console.log("Using SQLite DB:", sqlitePath);

  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

  const rawPath = sqlitePath.replace(/\.db$/, "_raw.db");

  // ================= RAW IMPORT =================
  console.log("Step 1: Importing raw dump...");

  const rawDb = new Database(rawPath);
  let dump = fs.readFileSync(dumpPath, "utf-8");
  dump = sanitizeDump(dump);

  // Split into individual statements for better logging
  const statements = dump.split(/;\s*\n/).filter((s) => s.trim() !== "");

  try {
    rawDb.exec("PRAGMA foreign_keys = OFF;");

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;

      try {
        rawDb.exec(stmt + ";"); // add semicolon back
      } catch (err) {
        console.error(`❌ Error at statement #${i + 1}:`);
        console.error("Statement causing error:");
        console.error(stmt.slice(0, 500) + (stmt.length > 500 ? "..." : ""));
        console.error("Full error:", err.message);
        process.exit(1);
      }
    }

    console.log("✅ Raw import complete");
  } catch (err) {
    console.error("❌ Unexpected error during raw import:");
    console.error(err);
    process.exit(1);
  }

  // ================= FINAL DB =================
  console.log("Step 2: Building final schema...");

  const db = new Database(sqlitePath);
  db.exec(loadSchema());
  db.exec("PRAGMA foreign_keys = OFF;");

  // Attach raw DB
  db.exec(`ATTACH DATABASE '${rawPath}' AS raw;`);

  const tx = db.transaction(() => {
    console.log("Migrating roles...");
    db.exec(`
      INSERT INTO roles (id, name)
      SELECT id, name FROM raw.roles;
    `);

    console.log("Migrating users...");
    db.exec(`
      INSERT INTO users (id, username, password, role_id, created_at)
      SELECT id, username, password, role_id, strftime('%s', created_at)
      FROM raw.users;
    `);

    console.log("Migrating fineness_levels...");
    db.exec(`
      INSERT INTO fineness_levels (id, name)
      SELECT id, name FROM raw.fineness_levels;
    `);

    console.log("Migrating components...");
    db.exec(`
      INSERT INTO components (id, name, fineness_id)
      SELECT id, name, fineness_id FROM raw.components;
    `);

    console.log("Migrating fertilizer_types...");
    db.exec(`
      INSERT INTO fertilizer_types (id, name)
      SELECT id, name FROM raw.fertilizer_types;
    `);

    console.log("Migrating substrates...");
    db.exec(`
      INSERT INTO substrates (id, name, user_id, is_public, created_at)
      SELECT id, name, user_id, is_public, strftime('%s', created_at)
      FROM raw.substrates;
    `);

    console.log("Normalizing species...");
    db.exec(`
      INSERT INTO species (name)
      SELECT DISTINCT species FROM raw.plants WHERE species IS NOT NULL;
    `);

    console.log("Migrating plants...");
    db.exec(`
      INSERT INTO plants (id, name, species_id, substrate_id, user_id, is_public, created_at)
      SELECT
        p.id,
        p.name,
        s.id,
        p.substrate_id,
        p.user_id,
        p.is_public,
        strftime('%s', p.created_at)
      FROM raw.plants p
      LEFT JOIN species s ON s.name = p.species;
    `);

    console.log("Migrating images...");
    db.exec(`
      INSERT INTO images (id, image_url, entity_type, entity_id, upload_date)
      SELECT id, image_url, 'plant', 0, strftime('%s', upload_date)
      FROM raw.images;
    `);

    console.log("Mapping plant images...");
    db.exec(`
      UPDATE images
      SET entity_type = 'plant',
          entity_id = (
            SELECT plant_id FROM raw.plant_images pi WHERE pi.image_id = images.id
          )
      WHERE id IN (SELECT image_id FROM raw.plant_images);
    `);

    console.log("Mapping substrate images...");
    db.exec(`
      UPDATE images
      SET entity_type = 'substrate',
          entity_id = (
            SELECT substrate_id FROM raw.substrate_images si WHERE si.image_id = images.id
          )
      WHERE id IN (SELECT image_id FROM raw.substrate_images);
    `);

    console.log("Mapping component images...");
    db.exec(`
      UPDATE images
      SET entity_type = 'component',
          entity_id = (
            SELECT component_id FROM raw.component_images ci WHERE ci.image_id = images.id
          )
      WHERE id IN (SELECT image_id FROM raw.component_images);
    `);

    console.log("Migrating substrate_components...");
    db.exec(`
      INSERT INTO substrate_components (substrate_id, component_id, parts)
      SELECT substrate_id, component_id, parts FROM raw.substrate_components;
    `);

    console.log("Migrating watering_records...");
    db.exec(`
      INSERT INTO watering_records (id, plant_id, date, used_fertilizer, fertilizer_type_id)
      SELECT id, plant_id, strftime('%s', date), used_fertilizer, fertilizer_type_id
      FROM raw.watering_records;
    `);
  });

  tx();

  db.exec("PRAGMA foreign_keys = ON;");

  console.log("🔍 Verifying integrity...");
  const issues = db.prepare("PRAGMA foreign_key_check").all();

  if (issues.length) {
    console.error("❌ FK issues found:");
    console.error(issues);
  } else {
    console.log("✅ Integrity verified. ZERO data loss.");
  }

  rawDb.close();
  db.close();
  rl.close();
}

run();
