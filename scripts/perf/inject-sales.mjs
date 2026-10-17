import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openPage } from "./lib/browser.mjs";
import {
  loadSession,
  parseFlags,
  repoRoot,
  requireId,
} from "./lib/session.mjs";

const HELP = `Writes N Sales into the served app's IndexedDB (Ionic Storage) or into the session database.

Usage: node scripts/perf/inject-sales.mjs --id <dev-up session id> --url <served url> [--n 300] [--points 12] [--mode idb|db] [--reset]

--mode idb  opens a fresh browser context on --url, writes sales_data, sales_seen and sales_summary
            (database _ionicstorage, object store _ionickv, the kv area the sales store keeps across
            logouts) and reads the list back. Items carry firstSeenAt and scrapedAt in ms; about one
            in seven is NEW against the 7 day watermark. --points does not apply (history is loaded
            from the API). The context is discarded afterwards, so this CLI is a smoke check; navbench
            imports injectSales to inject into the context it measures.
--mode db   writes N synthetic rows (ids perf-sale-<i>) and --points price points each straight
            into the session's SQLite database (sales_items, sales_price_points) in one
            transaction; about a quarter have first_seen_at within the last 24 h (NEW), the rest
            20 days back. --reset removes every perf-sale-% row. Needs only --id.`;

const DEV_PASSWORD = "DevPass123!";
const MAX_IMAGE_URLS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const SELLERS = [
  "Leafy Rarities",
  "Jungle Corner",
  "Broken Botanics",
  "Patchy Plants",
  "Green Atelier",
  "Monstera Mart",
  "Fern Factory",
  "Root & Rosette",
];
const GENERA = [
  "Monstera",
  "Philodendron",
  "Calathea",
  "Alocasia",
  "Hoya",
  "Ficus",
  "Pothos",
  "Anthurium",
];
const NEW_WINDOW_DAYS = 7;
const ID_LIKE = "perf-sale-%";

const collectUploadUrls = (value, found) => {
  if (found.size >= MAX_IMAGE_URLS) return;
  if (typeof value === "string") {
    if (value.startsWith("/uploads/") && !/s/.test(value)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectUploadUrls(item, found);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectUploadUrls(item, found);
  }
};

/** Same-origin /uploads paths of the session's grower plants, used as sale images. */
export const fetchImageUrls = async (apiBase, username = "grower") => {
  const login = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: DEV_PASSWORD }),
  });
  if (!login.ok)
    throw new Error(`Login as ${username} answered ${login.status}`);
  const body = await login.json();
  const token = (body.data ?? body).accessToken;
  const plants = await fetch(`${apiBase}/plants?scope=mine&limit=100`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!plants.ok) throw new Error(`GET /plants answered ${plants.status}`);
  const found = new Set();
  collectUploadUrls(await plants.json(), found);
  return [...found];
};

const writeEnvelopes = async ({ n, imageUrls, allNew, sellers, genera, newWindowDays }) => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const watermark = now - newWindowDays * DAY_MS;
  const items = [];
  for (let i = 0; i < n; i++) {
    const seller = sellers[i % sellers.length];
    const price = 6 + ((i * 7) % 90) + 0.5;
    const oldPrice = Math.round(price * 1.35 * 100) / 100;
    const nameFull = `${genera[i % genera.length]} variegata cultivar number ${i} in a decorative pot`;
    const isNew = allNew ? true : i % 7 === 0;
    const item = {
      id: `perf-sale-${i}`,
      name: nameFull.length > 45 ? `${nameFull.slice(0, 42)}...` : nameFull,
      nameFull,
      seller,
      price,
      oldPrice,
      discountPct: Math.round((1 - price / oldPrice) * 100),
      link: `https://shop.example/${i % sellers.length}/item-${i}`,
      firstSeenAt: isNew ? now - ((i * 37) % 1380 + 1) * 60 * 1000 : now - 20 * DAY_MS - i * 1000,
      scrapedAt: now - (i % 600) * 1000,
    };
    if (imageUrls.length) item.imageUrl = imageUrls[i % imageUrls.length];
    items.push(item);
  }
  const newCount = items.filter((item) => item.firstSeenAt > watermark).length;
  const latestFirstSeenAt = items.reduce((max, item) => Math.max(max, item.firstSeenAt), 0) || null;
  // A list stamped far in the future counts as newer than any server refresh, so the first
  // visit shows the injected list instead of replaying it from the server.
  const listRefreshedAt = now + 3650 * DAY_MS;
  const summary = {
    total: n,
    newCount,
    refreshedAt: listRefreshedAt,
    listRefreshedAt,
    latestFirstSeenAt,
  };

  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("_ionicstorage");
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("_ionickv"))
        request.result.createObjectStore("_ionickv");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!db.objectStoreNames.contains("_ionickv")) {
    db.close();
    throw new Error("IndexedDB _ionicstorage exists without object store _ionickv");
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction("_ionickv", "readwrite");
    const store = tx.objectStore("_ionickv");
    const put = (key, data) => store.put({ data, timestamp: now, keepOnClear: true }, key);
    put("sales_data", items);
    put("sales_seen", { watermark, ids: [] });
    put("sales_summary", summary);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  const count = await new Promise((resolve, reject) => {
    const request = db.transaction("_ionickv").objectStore("_ionickv").get("sales_data");
    request.onsuccess = () => resolve(request.result?.data?.length ?? 0);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return count;
};

/**
 * Writes sales_data, sales_seen and sales_summary into the kv Ionic Storage area (database
 * _ionicstorage) through the open page. Reload the page afterwards so the stores hydrate from the
 * new data. The page must have booted once so Ionic Storage created its database. Price history is
 * not stored client side any more: the detail page loads it from the API.
 */
export const injectSales = async (
  page,
  { n = 300, imageUrls = [], allNew = false } = {},
) => {
  const written = await page.evaluate(writeEnvelopes, {
    n,
    imageUrls,
    allNew,
    sellers: SELLERS,
    genera: GENERA,
    newWindowDays: NEW_WINDOW_DAYS,
  });
  if (written !== n)
    throw new Error(`Injected ${n} sales but read back ${written}`);
  return written;
};

const openDb = (dbPath) => {
  const require = createRequire(path.join(repoRoot, "backend", "package.json"));
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  return db;
};

const injectDb = (dbPath, { n, points, reset }) => {
  const db = openDb(dbPath);
  try {
    if (reset) {
      const removed = db.transaction(() => {
        db.prepare("DELETE FROM sales_price_points WHERE sale_id LIKE ?").run(
          ID_LIKE,
        );
        return db
          .prepare("DELETE FROM sales_items WHERE sale_id LIKE ?")
          .run(ID_LIKE).changes;
      })();
      return { removed };
    }
    const now = Date.now();
    const insertItem = db.prepare(
      `INSERT OR REPLACE INTO sales_items
        (sale_id, source_key, seller, name, link, image_url, old_price, new_price, discount_pct,
         first_seen_at, last_seen_at, scraped_at, active)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 1)`,
    );
    const insertPoint = db.prepare(
      "INSERT OR IGNORE INTO sales_price_points (sale_id, observed_at, price) VALUES (?, ?, ?)",
    );
    db.transaction(() => {
      for (let i = 0; i < n; i++) {
        const seller = SELLERS[i % SELLERS.length];
        const price = 6 + ((i * 7) % 90) + 0.5;
        const oldPrice = Math.round(price * 1.35 * 100) / 100;
        const id = `perf-sale-${i}`;
        const firstSeen =
          i % 4 === 0
            ? now - (((i * 37) % 1380) + 1) * 60 * 1000
            : now - 20 * DAY_MS - i * 1000;
        const name = `${GENERA[i % GENERA.length]} variegata cultivar number ${i} in a decorative pot`;
        insertItem.run(
          id,
          `perf-${i % SELLERS.length}`,
          seller,
          name,
          `https://shop.example/${i % SELLERS.length}/item-${i}`,
          oldPrice,
          price,
          Math.round((1 - price / oldPrice) * 100),
          firstSeen,
          now,
          now - (i % 600) * 1000,
        );
        for (let p = 0; p < points; p++) {
          const factor = 1 + ((points - p) % 5) * 0.04;
          insertPoint.run(
            id,
            now - (points - p) * DAY_MS,
            Math.round(price * factor * 100) / 100,
          );
        }
      }
    })();
    return { written: n };
  } finally {
    db.close();
  }
};

const main = async () => {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(HELP);
    return;
  }
  const mode = flags.mode ?? "idb";
  if (mode !== "idb" && mode !== "db")
    throw new Error(`Unknown --mode "${mode}" (idb or db)`);
  const id = requireId(flags);
  if (mode === "db") {
    const n = Number(flags.n ?? 300);
    const points = Number(flags.points ?? 12);
    if (!Number.isInteger(n) || n < 1)
      throw new Error("--n must be a positive integer");
    if (!Number.isInteger(points) || points < 0)
      throw new Error("--points must be a non-negative integer");
    const session = loadSession(id);
    const result = injectDb(path.join(session.dataDir, "plantcare.db"), {
      n,
      points,
      reset: flags.reset === true,
    });
    console.log(
      result.removed !== undefined
        ? `Removed ${result.removed} perf sales.`
        : `Wrote ${result.written} sales with ${points} price points each.`,
    );
    return;
  }
  if (typeof flags.url !== "string")
    throw new Error("Missing --url (the URL printed by serve-dist.mjs)");
  const n = Number(flags.n ?? 300);
  const points = Number(flags.points ?? 12);
  if (!Number.isInteger(n) || n < 1)
    throw new Error("--n must be a positive integer");
  if (!Number.isInteger(points) || points < 0)
    throw new Error("--points must be a non-negative integer");

  const session = loadSession(id);
  const imageUrls = await fetchImageUrls(session.apiBase);
  const browser = await openPage({ throttled: false });
  try {
    await browser.page.goto(flags.url, { waitUntil: "load" });
    await browser.page.waitForSelector("ion-input input", { timeout: 60000 });
    const written = await injectSales(browser.page, { n, imageUrls });
    console.log(
      `Injected ${written} sales (${imageUrls.length} distinct image urls).`,
    );
  } finally {
    await browser.close();
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
