import { pathToFileURL } from "node:url";
import { openPage } from "./lib/browser.mjs";
import { loadSession, parseFlags, requireId } from "./lib/session.mjs";

const HELP = `Writes N Sales and their price history into the served app's IndexedDB (Ionic Storage).

Usage: node scripts/perf/inject-sales.mjs --id <dev-up session id> --url <served url> [--n 300] [--points 12] [--mode idb|db]

--mode idb  opens a fresh browser context on --url, writes sales_data and sales_price_history
            (database _ionicstorage, object store _ionickv) and reads them back. The context is
            discarded afterwards, so this CLI is a smoke check; navbench imports injectSales to
            inject into the context it measures.
--mode db   not available yet (lands with task B-14), exits with code 2.`;

const DEV_PASSWORD = "DevPass123!";
const MAX_IMAGE_URLS = 200;

const collectUploadUrls = (value, found) => {
  if (found.size >= MAX_IMAGE_URLS) return;
  if (typeof value === "string") {
    if (value.startsWith("/uploads/")) found.add(value);
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
  if (!login.ok) throw new Error(`Login as ${username} answered ${login.status}`);
  const body = await login.json();
  const token = (body.data ?? body).accessToken;
  const plants = await fetch(`${apiBase}/plants`, { headers: { authorization: `Bearer ${token}` } });
  if (!plants.ok) throw new Error(`GET /plants answered ${plants.status}`);
  const found = new Set();
  collectUploadUrls(await plants.json(), found);
  return [...found];
};

const writeEnvelopes = async ({ n, points, imageUrls, allNew }) => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const sellers = [
    "Leafy Rarities",
    "Jungle Corner",
    "Broken Botanics",
    "Patchy Plants",
    "Green Atelier",
    "Monstera Mart",
    "Fern Factory",
    "Root & Rosette",
  ];
  const genera = ["Monstera", "Philodendron", "Calathea", "Alocasia", "Hoya", "Ficus", "Pothos", "Anthurium"];
  const items = [];
  const history = [];
  for (let i = 0; i < n; i++) {
    const seller = sellers[i % sellers.length];
    const price = 6 + ((i * 7) % 90) + 0.5;
    const nameFull = `${genera[i % genera.length]} variegata cultivar number ${i} in a decorative pot`;
    items.push({
      id: `perf-sale-${i}`,
      name: nameFull.length > 45 ? `${nameFull.slice(0, 44)}...` : nameFull,
      nameFull,
      seller,
      price,
      oldPrice: Math.round(price * 1.35 * 100) / 100,
      link: `https://shop.example/${i % sellers.length}/item-${i}`,
      imageUrl: imageUrls.length ? imageUrls[i % imageUrls.length] : undefined,
      scrapedAt: new Date(now - (i % 600) * 1000).toISOString(),
      isNew: allNew ? true : i % 7 === 0,
    });
    const pts = [];
    for (let p = 0; p < points; p++) {
      pts.push({
        price: Math.round(price * (1 + ((points - p) % 5) * 0.04) * 100) / 100,
        timestamp: now - (points - p) * DAY_MS,
      });
    }
    history.push({ id: `perf-sale-${i}`, points: pts });
  }

  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("_ionicstorage");
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("_ionickv")) request.result.createObjectStore("_ionickv");
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
    store.put({ data: items, timestamp: now, keepOnClear: true }, "sales_data");
    store.put({ data: history, timestamp: now, keepOnClear: true }, "sales_price_history");
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
 * Writes both envelopes through the open page. Reload the page afterwards so the stores hydrate
 * from the new data. The page must have booted once so Ionic Storage created its database.
 */
export const injectSales = async (page, { n = 300, points = 12, imageUrls = [], allNew = false } = {}) => {
  const written = await page.evaluate(writeEnvelopes, { n, points, imageUrls, allNew });
  if (written !== n) throw new Error(`Injected ${n} sales but read back ${written}`);
  return written;
};

const main = async () => {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(HELP);
    return;
  }
  const mode = flags.mode ?? "idb";
  if (mode === "db") {
    console.error("db mode lands with task B-14");
    process.exit(2);
  }
  if (mode !== "idb") throw new Error(`Unknown --mode "${mode}" (idb or db)`);
  const id = requireId(flags);
  if (typeof flags.url !== "string") throw new Error("Missing --url (the URL printed by serve-dist.mjs)");
  const n = Number(flags.n ?? 300);
  const points = Number(flags.points ?? 12);
  if (!Number.isInteger(n) || n < 1) throw new Error("--n must be a positive integer");
  if (!Number.isInteger(points) || points < 0) throw new Error("--points must be a non-negative integer");

  const session = loadSession(id);
  const imageUrls = await fetchImageUrls(session.apiBase);
  const browser = await openPage({ throttled: false });
  try {
    await browser.page.goto(flags.url, { waitUntil: "load" });
    await browser.page.waitForSelector("ion-input input", { timeout: 60000 });
    const written = await injectSales(browser.page, { n, points, imageUrls });
    console.log(`Injected ${written} sales with ${points} price points each (${imageUrls.length} distinct image urls).`);
  } finally {
    await browser.close();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
