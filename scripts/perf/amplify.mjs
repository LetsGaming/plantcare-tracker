import { createRequire } from "node:module";
import path from "node:path";
import { createContext } from "../dev/seed/context.mjs";
import { loadSession, parseFlags, repoRoot, requireId } from "./lib/session.mjs";

const HELP = `Usage: node scripts/perf/amplify.mjs --id <session> [options]

Adds perf- prefixed data to a dev-up session so list endpoints and screens can be measured at scale.

  --plants N              plants for --user via the API (default 180)
  --records-per-plant N   watering records per amplified plant, inserted via SQL (default 120)
  --substrates N          substrates for --user via the API (default 90)
  --components N          components via the API, created as admin (default 40)
  --public-plants N       public plants of user "collector", bulk inserted via SQL (default 0)
  --user NAME             owner of plants and substrates (default grower)
  --reset                 delete every perf- row (and its watering records and images) and exit

Plants get 1 to 3 image rows each that point at files already in the session uploads folder.`;

const DAY_SECONDS = 24 * 60 * 60;
const PREFIX = "perf-";
const LIKE_PREFIX = `${PREFIX}%`;
const SPECIES_COUNT = 12;
const FINENESS_LEVELS = 3;
const COMPONENTS_PER_SUBSTRATE = 3;

const intFlag = (flags, name, fallback) => {
  const raw = flags[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a non-negative integer`);
  return value;
};

const openDb = (dbPath) => {
  const require = createRequire(path.join(repoRoot, "backend", "package.json"));
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  db.pragma("busy_timeout = 5000");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
};

const perfIds = (db, table) =>
  db
    .prepare(`SELECT id FROM ${table} WHERE name LIKE ?`)
    .all(LIKE_PREFIX)
    .map((row) => row.id);

const deleteImages = (db, type, ids) => {
  const stmt = db.prepare("DELETE FROM images WHERE entity_type = ? AND entity_id = ?");
  for (const id of ids) stmt.run(type, id);
};

const reset = (db) => {
  db.transaction(() => {
    deleteImages(db, "plant", perfIds(db, "plants"));
    deleteImages(db, "substrate", perfIds(db, "substrates"));
    deleteImages(db, "component", perfIds(db, "components"));
    db.prepare("DELETE FROM plants WHERE name LIKE ?").run(LIKE_PREFIX);
    db.prepare("DELETE FROM substrates WHERE name LIKE ?").run(LIKE_PREFIX);
    db.prepare("DELETE FROM components WHERE name LIKE ?").run(LIKE_PREFIX);
    db.prepare(
      "DELETE FROM species WHERE name LIKE ? AND id NOT IN (SELECT species_id FROM plants WHERE species_id IS NOT NULL)",
    ).run(LIKE_PREFIX);
  })();
};

const printCounts = (db) => {
  const one = (sql) => db.prepare(sql).get().n;
  console.log(
    `totals: ${one("SELECT COUNT(*) AS n FROM plants")} plants ` +
      `(${one("SELECT COUNT(*) AS n FROM plants WHERE is_public = 1")} public), ` +
      `${one("SELECT COUNT(*) AS n FROM substrates")} substrates, ` +
      `${one("SELECT COUNT(*) AS n FROM components")} components, ` +
      `${one("SELECT COUNT(*) AS n FROM watering_records")} watering records, ` +
      `${one("SELECT COUNT(*) AS n FROM images WHERE entity_type = 'plant'")} plant images`,
  );
  const perUser = db
    .prepare(
      `SELECT u.username AS username,
              (SELECT COUNT(*) FROM plants p WHERE p.user_id = u.id) AS plants,
              (SELECT COUNT(*) FROM watering_records w JOIN plants p ON p.id = w.plant_id WHERE p.user_id = u.id) AS records
       FROM users u ORDER BY u.username`,
    )
    .all();
  for (const row of perUser) {
    console.log(`  ${row.username}: ${row.plants} plants, ${row.records} watering records`);
  }
};

const main = async () => {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(HELP);
    return;
  }
  const session = loadSession(requireId(flags));
  const dbPath = path.join(session.dataDir, "plantcare.db");
  const user = typeof flags.user === "string" ? flags.user : "grower";

  const db = openDb(dbPath);
  try {
    if (flags.reset) {
      reset(db);
      console.log("removed every perf- row");
      printCounts(db);
      return;
    }

    const plantCount = intFlag(flags, "plants", 180);
    const recordsPerPlant = intFlag(flags, "records-per-plant", 120);
    const substrateCount = intFlag(flags, "substrates", 90);
    const componentCount = intFlag(flags, "components", 40);
    const publicPlants = intFlag(flags, "public-plants", 0);

    const existing = ["plants", "substrates", "components"].reduce((sum, table) => sum + perfIds(db, table).length, 0);
    if (existing > 0) throw new Error("perf- rows already exist; run with --reset first");

    const log = (message) => console.log(`[amplify] ${message}`);
    const ctx = createContext({ apiUrl: session.apiBase, dbPath, log });
    await ctx.login("admin");
    const userToken = await ctx.login(user);

    log(`creating ${componentCount} components`);
    const componentIds = [];
    for (let i = 0; i < componentCount; i++) {
      const created = await ctx.call("POST", "/components", {
        token: ctx.token("admin"),
        json: { name: `${PREFIX}component-${i + 1}`, fineness: (i % FINENESS_LEVELS) + 1 },
      });
      componentIds.push(created.id);
    }

    log(`creating ${substrateCount} substrates`);
    const substrateIds = [];
    for (let i = 0; i < substrateCount; i++) {
      const created = await ctx.call("POST", "/substrates", {
        token: userToken,
        json: { name: `${PREFIX}substrate-${i + 1}`, isPublic: false },
      });
      substrateIds.push(created.substrate_id);
      if (componentIds.length > 0) {
        const components = [];
        for (let j = 0; j < Math.min(COMPONENTS_PER_SUBSTRATE, componentIds.length); j++) {
          components.push({ componentId: componentIds[(i + j) % componentIds.length], parts: j + 1 });
        }
        await ctx.call("POST", `/substrates/${created.substrate_id}/components`, {
          token: userToken,
          json: { components },
        });
      }
    }

    log(`creating ${plantCount} plants`);
    const plantIds = [];
    for (let i = 0; i < plantCount; i++) {
      const created = await ctx.call("POST", "/plants", {
        token: userToken,
        json: {
          name: `${PREFIX}plant-${i + 1}`,
          species: `${PREFIX}species-${(i % SPECIES_COUNT) + 1}`,
          substrateId: substrateIds.length > 0 ? substrateIds[i % substrateIds.length] : undefined,
          isPublic: false,
        },
      });
      plantIds.push(created.plant_id);
    }

    const imageUrls = db
      .prepare("SELECT DISTINCT image_url FROM images WHERE entity_type = 'plant' ORDER BY image_url")
      .all()
      .map((row) => row.image_url);
    const fertilizerTypeIds = db
      .prepare("SELECT id FROM fertilizer_types ORDER BY id")
      .all()
      .map((row) => row.id);
    const now = Math.floor(Date.now() / 1000);

    log("inserting watering records, image rows and public plants");
    db.transaction(() => {
      const insertRecord = db.prepare(
        "INSERT INTO watering_records (plant_id, date, used_fertilizer, fertilizer_type_id) VALUES (?, ?, ?, ?)",
      );
      for (let p = 0; p < plantIds.length; p++) {
        const rhythmDays = 2 + (p % 6);
        for (let r = 0; r < recordsPerPlant; r++) {
          const fertilized = r % 4 === 0 && fertilizerTypeIds.length > 0;
          insertRecord.run(
            plantIds[p],
            now - ((recordsPerPlant - 1 - r) * rhythmDays + (p % 3)) * DAY_SECONDS,
            fertilized ? 1 : 0,
            fertilized ? fertilizerTypeIds[r % fertilizerTypeIds.length] : null,
          );
        }
      }

      if (imageUrls.length > 0) {
        const insertImage = db.prepare(
          "INSERT INTO images (image_url, entity_type, entity_id, upload_date) VALUES (?, 'plant', ?, ?)",
        );
        for (let p = 0; p < plantIds.length; p++) {
          const images = (p % 3) + 1;
          for (let k = 0; k < images; k++) {
            insertImage.run(imageUrls[(p + k) % imageUrls.length], plantIds[p], now - (images - k) * 14 * DAY_SECONDS);
          }
        }
      } else if (plantIds.length > 0) {
        log("no existing plant images to reuse, skipping image rows");
      }

      if (publicPlants > 0) {
        const collector = db.prepare("SELECT id FROM users WHERE username = 'collector'").get();
        if (!collector) throw new Error('user "collector" not found (seed the session first)');
        const insertPlant = db.prepare(
          "INSERT INTO plants (name, species_id, substrate_id, user_id, is_public, created_at) VALUES (?, NULL, NULL, ?, 1, ?)",
        );
        for (let i = 0; i < publicPlants; i++) {
          insertPlant.run(`${PREFIX}public-${i + 1}`, collector.id, now - i * 60);
        }
      }
    })();

    printCounts(db);
  } finally {
    db.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
