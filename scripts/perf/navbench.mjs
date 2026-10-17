import fs from "node:fs";
import path from "node:path";
import { fetchImageUrls, injectSales } from "./inject-sales.mjs";
import { openPage, throttle } from "./lib/browser.mjs";
import {
  blockedTime,
  compareToBaseline,
  evaluateTargets,
  longestTask,
  summarizeRequests,
  summarizeRuns,
  toMarkdown,
} from "./lib/metrics.mjs";
import { loadSession, parseFlags, repoRoot, requireId } from "./lib/session.mjs";

const HELP = `Navigation benchmark against the served production build (4x CPU, Fast 4G, mobile profile).

Usage: node scripts/perf/navbench.mjs --id <dev-up session id> --url <served url>
         [--scenario tabs|sales-entry|plants-cold|mark-all-seen|search|public-scroll|sales-replay|round-tap|heap-20-switches|all (comma list ok)]
         [--runs 5] [--n 300] [--label <name>] [--compare <baseline.json>] [--targets]
         [--user grower] [--headed]

Every run uses a fresh browser context; the grower logs in through the login form.
Results: scripts/perf/results/<label>-navbench.json and .md. --n is the injected Sales count
(plants-cold injects nothing unless --n is given).
sales-replay measures the replay of the sales the server holds: seed them first with
inject-sales.mjs --mode db --n 2000. public-scroll expects a large public plant set (amplify.mjs).`;

const PASSWORD = "DevPass123!";
const SETTLE_QUIET_MS = 500;
const NETWORK_QUIET_MS = 1000;
const STEP_TIMEOUT_MS = 120000;
const SETUP_TIMEOUT_MS = 120000;
const POLL_MS = 100;
const NO_THROTTLE_NETWORK = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
const COLD_QUIET_MS = 2000;
const COLD_TIMEOUT_MS = 300000;
const KV_DB = "_ionicstorage";
const CACHE_DB = "plantcare_cache";
const KV_STORE = "_ionickv";
const KV_ACCOUNT_KEYS = ["sales_data", "sales_summary", "sales_seen"];
const SCENARIOS = [
  "tabs",
  "sales-entry",
  "plants-cold",
  "mark-all-seen",
  "search",
  "public-scroll",
  "sales-replay",
  "round-tap",
  "heap-20-switches",
];
const PUBLIC_PAGES = 6;
const ROUND_TAPS = 5;
const SWITCHES = 20;
const SWITCH_ROUTE = ["substrates", "components", "sales", "plants"];
const VISIBLE_PAGE = "ion-router-outlet .ion-page:not(.ion-page-hidden)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const installSettleObserver = (page) =>
  page.evaluate(() => {
    window.__lastMutation = performance.now();
    window.__mutationObserver?.disconnect();
    const target = document.querySelector("ion-router-outlet") ?? document.body;
    window.__mutationObserver = new MutationObserver(() => {
      window.__lastMutation = performance.now();
    });
    window.__mutationObserver.observe(target, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });

const quietForMs = (page) => page.evaluate(() => performance.now() - window.__lastMutation);

class Bench {
  constructor({ url, apiBase, imageUrls, headed }) {
    this.url = url;
    this.apiBase = apiBase;
    this.imageUrls = imageUrls;
    this.headed = headed;
    this.requestLog = [];
    this.wateringResponses = [];
    this.apiResponses = [];
    this.lastRequestAt = Date.now();
  }

  async start() {
    this.browser = await openPage({ headless: !this.headed, throttled: false });
    const { page, client } = this.browser;
    this.page = page;
    this.client = client;
    page.on("request", (request) => {
      this.requestLog.push(request.url());
      this.lastRequestAt = Date.now();
    });
    page.on("response", (response) => {
      if (/\/watering\/plant\//.test(response.url())) this.wateringResponses.push(Date.now());
      if (/\/api\//.test(response.url())) this.apiResponses.push(Date.now());
    });
    await client.send("Performance.enable");
    await client.send("HeapProfiler.enable");
  }

  async close() {
    await this.browser?.close();
  }

  async boot({ injectCount, allNew }) {
    const { page } = this;
    await page.goto(this.url, { waitUntil: "load" });
    await page.waitForSelector("ion-input input", { timeout: SETUP_TIMEOUT_MS });
    if (injectCount > 0) {
      await injectSales(page, { n: injectCount, imageUrls: this.imageUrls, allNew });
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector("ion-input input", { timeout: SETUP_TIMEOUT_MS });
    }
  }

  async login(username = "grower") {
    const { page } = this;
    await page.locator("ion-input input").nth(0).fill(username);
    await page.locator("ion-input input").nth(1).fill(PASSWORD);
    await page.locator("ion-button.submit").click();
    await page.waitForSelector("ion-tab-button", { timeout: SETUP_TIMEOUT_MS });
  }

  async settle({ networkQuietMs = 0, domQuietMs = SETTLE_QUIET_MS, timeoutMs = STEP_TIMEOUT_MS } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const quiet = await quietForMs(this.page);
      const networkQuiet = Date.now() - this.lastRequestAt;
      if (quiet >= domQuietMs && networkQuiet >= networkQuietMs) return;
      if (Date.now() > deadline) throw new Error(`Page did not settle within the step timeout (dom quiet ${Math.round(quiet)} ms, network quiet ${networkQuiet} ms, ${this.requestLog.length} requests)`);
      await sleep(POLL_MS);
    }
  }

  async applyThrottle() {
    await throttle(this.client);
  }

  async removeThrottle() {
    await throttle(this.client, { cpu: 1, network: NO_THROTTLE_NETWORK });
  }

  /**
   * Empties the account cache database and removes the sales entries from the kv database (the
   * auth token and settings stay). Returns the keys still present in each.
   */
  async clearAccountCache() {
    return this.page.evaluate(
      ({ kvName, cacheName, storeName, kvKeys }) => {
        const open = (name) =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onupgradeneeded = () => {
              if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        const run = async (name, work) => {
          const db = await open(name);
          try {
            return await new Promise((resolve, reject) => {
              const tx = db.transaction(storeName, "readwrite");
              const store = tx.objectStore(storeName);
              work(store);
              const keys = store.getAllKeys();
              tx.oncomplete = () => resolve(keys.result);
              tx.onerror = () => reject(tx.error);
              tx.onabort = () => reject(tx.error);
            });
          } finally {
            db.close();
          }
        };
        return Promise.all([
          run(kvName, (store) => {
            for (const key of kvKeys) store.delete(key);
          }),
          run(cacheName, (store) => store.clear()),
        ]).then(([kv, cache]) => ({ kv, cache }));
      },
      { kvName: KV_DB, cacheName: CACHE_DB, storeName: KV_STORE, kvKeys: KV_ACCOUNT_KEYS },
    );
  }

  /** Used JS heap in MB after a forced collection, read through Runtime.getHeapUsage. */
  async heapUsageMb() {
    await this.client.send("HeapProfiler.collectGarbage");
    const { usedSize } = await this.client.send("Runtime.getHeapUsage");
    return usedSize / (1024 * 1024);
  }

  async heapMb() {
    await this.client.send("HeapProfiler.collectGarbage");
    const { metrics } = await this.client.send("Performance.getMetrics");
    const used = metrics.find((metric) => metric.name === "JSHeapUsedSize");
    return used ? used.value / (1024 * 1024) : null;
  }

  async visibleImageCount() {
    return this.page.evaluate(
      () =>
        document.querySelectorAll(
          'ion-router-outlet .ion-page:not(.ion-page-hidden) img[src*="/uploads/"], ion-router-outlet .ion-page:not(.ion-page-hidden) ion-img[src*="/uploads/"]',
        ).length,
    );
  }

  /** Runs `action` (a short page.evaluate or navigation), waits for the DOM to settle, returns the step record. */
  async step(action, { networkQuietMs = 0, domQuietMs, timeoutMs, reinstallObserver = false, until, extra } = {}) {
    const { page } = this;
    const tasksBefore = reinstallObserver ? 0 : await page.evaluate(() => window.__longtasks.length);
    const requestsBefore = this.requestLog.length;
    const wateringBefore = this.wateringResponses.length;
    const apiBefore = this.apiResponses.length;
    const startedAt = Date.now();
    await action();
    if (reinstallObserver) {
      await page.waitForSelector("ion-tab-button", { timeout: STEP_TIMEOUT_MS });
      await installSettleObserver(page);
    }
    if (until) await until();
    await this.settle({ networkQuietMs, domQuietMs, timeoutMs });
    const tasks = (await page.evaluate((from) => window.__longtasks.slice(from), tasksBefore)).filter(Boolean);
    const requests = summarizeRequests(this.requestLog.slice(requestsBefore));
    const domNodes = await page.evaluate(() => document.querySelectorAll("*").length);
    const cards = await this.visibleImageCount();
    const lastWatering = this.wateringResponses.length > wateringBefore ? this.wateringResponses.at(-1) : null;
    const lastApi = this.apiResponses.length > apiBefore ? this.apiResponses.at(-1) : null;
    const extras = extra ? await extra() : {};
    return {
      ...extras,
      lastApiResponseMs: lastApi === null ? null : lastApi - startedAt,
      longTasks: tasks.length,
      blockedMs: blockedTime(tasks),
      longestMs: longestTask(tasks),
      domNodes,
      heapMb: await this.heapMb(),
      apiRequests: requests.api,
      uploadRequests: requests.uploads,
      wateringPlantRequests: requests.wateringPlant,
      lastWateringResponseMs: lastWatering === null ? null : lastWatering - startedAt,
      imageRequestsPerCard: cards > 0 ? requests.uploads / cards : null,
      requestsByPath: requests.byPath,
    };
  }

  tap(tab) {
    return async () => {
      const found = await this.page.evaluate((name) => {
        const button = [...document.querySelectorAll("ion-tab-button")].find((b) => b.tab === name);
        if (!button) return false;
        window.__lastMutation = performance.now();
        button.click();
        return true;
      }, tab);
      if (!found) throw new Error(`No tab button "${tab}"`);
    };
  }
}

const newSession = async (context, { injectCount, allNew }) => {
  const bench = new Bench(context);
  await bench.start();
  await bench.boot({ injectCount, allNew });
  await bench.login();
  await installSettleObserver(bench.page);
  await bench.settle({ networkQuietMs: NETWORK_QUIET_MS });
  await bench.applyThrottle();
  return bench;
};

const scenarios = {
  async tabs(context, n) {
    const bench = await newSession(context, { injectCount: n });
    try {
      const out = {};
      const route = ["substrates", "components", "sales", "plants", "substrates", "components", "sales", "plants"];
      for (const [index, tab] of route.entries()) {
        out[`tabs/${String(index + 1).padStart(2, "0")}-${tab}`] = await bench.step(bench.tap(tab));
      }
      return out;
    } finally {
      await bench.close();
    }
  },

  async "sales-entry"(context, n) {
    const bench = await newSession(context, { injectCount: n });
    try {
      const out = {};
      out["sales-entry/first-entry"] = await bench.step(bench.tap("sales"));
      await bench.step(bench.tap("plants"));
      out["sales-entry/warm-reentry"] = await bench.step(bench.tap("sales"));
      out["sales-entry/substrates-with-sales-mounted"] = await bench.step(bench.tap("substrates"));
      return out;
    } finally {
      await bench.close();
    }
  },

  async "plants-cold"(context, n, explicitN) {
    const bench = await newSession(context, { injectCount: explicitN ? n : 0 });
    try {
      const target = `${bench.url.replace(/#.*$/, "")}#/tabs/plants`;
      const out = {};
      await bench.removeThrottle();
      const remaining = await bench.clearAccountCache();
      const leftover = [...remaining.kv.filter((key) => KV_ACCOUNT_KEYS.includes(key)), ...remaining.cache];
      if (leftover.length > 0) throw new Error(`Account cache keys survived: ${leftover.join(", ")}`);
      await bench.page.goto("about:blank");
      await bench.applyThrottle();
      out["plants-cold/cold-load"] = await bench.step(
        async () => {
          await bench.page.goto(target, { waitUntil: "commit" });
        },
        { networkQuietMs: COLD_QUIET_MS, domQuietMs: COLD_QUIET_MS, timeoutMs: COLD_TIMEOUT_MS, reinstallObserver: true },
      );
      return out;
    } finally {
      await bench.close();
    }
  },

  async "mark-all-seen"(context, n) {
    const bench = await newSession(context, { injectCount: n, allNew: true });
    try {
      const out = {};
      await bench.step(bench.tap("sales"));
      await bench.page.waitForSelector(".mark-all", { timeout: STEP_TIMEOUT_MS });
      await bench.settle();
      out["mark-all-seen/mark-all"] = await bench.step(async () => {
        await bench.page.evaluate(() => {
          window.__lastMutation = performance.now();
          document.querySelector(".mark-all").click();
        });
      });
      return out;
    } finally {
      await bench.close();
    }
  },

  async search(context, n) {
    const bench = await newSession(context, { injectCount: n });
    try {
      const out = {};
      await bench.step(bench.tap("sales"));
      const type = (value) => async () => {
        const ok = await bench.page.evaluate((text) => {
          const bar = document.querySelector(
            "ion-router-outlet .ion-page:not(.ion-page-hidden) ion-searchbar",
          );
          if (!bar) return false;
          window.__lastMutation = performance.now();
          bar.value = text;
          bar.dispatchEvent(new CustomEvent("ionInput", { detail: { value: text } }));
          return true;
        }, value);
        if (!ok) throw new Error("No visible ion-searchbar on the Sales page");
      };
      out["search/type-r"] = await bench.step(type("r"));
      out["search/type-ro"] = await bench.step(type("ro"));
      out["search/type-ros"] = await bench.step(type("ros"));
      out["search/clear"] = await bench.step(type(""));
      return out;
    } finally {
      await bench.close();
    }
  },

  async "public-scroll"(context) {
    const bench = await newSession(context, { injectCount: 0 });
    try {
      const out = {};
      const extra = async () => ({
        cards: await bench.page.evaluate((root) => document.querySelectorAll(`${root} .tag-card`).length, VISIBLE_PAGE),
        publicPageRequests: bench.requestLog.filter((url) => /scope=public/.test(url) && /cursor=/.test(url)).length,
      });
      await bench.step(bench.tap("plants"));
      out["public-scroll/first-page"] = await bench.step(
        async () => {
          const found = await bench.page.evaluate((root) => {
            const button = document.querySelector(`${root} ion-segment-button[value="public"]`);
            if (!button) return false;
            window.__lastMutation = performance.now();
            button.click();
            return true;
          }, VISIBLE_PAGE);
          if (!found) throw new Error("No public segment button on the Plants page");
        },
        { networkQuietMs: NETWORK_QUIET_MS, extra },
      );
      for (let page = 1; page <= PUBLIC_PAGES; page++) {
        out[`public-scroll/next-page-${String(page).padStart(2, "0")}`] = await bench.step(
          async () => {
            const scrolled = await bench.page.evaluate(async (root) => {
              const content = document.querySelector(`${root} ion-content`);
              if (!content) return false;
              const scroller = await content.getScrollElement();
              window.__lastMutation = performance.now();
              scroller.scrollTop = scroller.scrollHeight;
              return true;
            }, VISIBLE_PAGE);
            if (!scrolled) throw new Error("No scrollable ion-content on the Plants page");
          },
          { networkQuietMs: NETWORK_QUIET_MS, extra },
        );
      }
      return out;
    } finally {
      await bench.close();
    }
  },

  async "sales-replay"(context) {
    const bench = await newSession(context, { injectCount: 0 });
    try {
      await bench.page.evaluate((root) => {
        window.__countTexts = [];
        new MutationObserver(() => {
          const text = document.querySelector(`${root} .count`)?.textContent?.trim();
          if (text && window.__countTexts.at(-1) !== text) window.__countTexts.push(text);
        }).observe(document.body, { subtree: true, childList: true, characterData: true });
      }, VISIBLE_PAGE);
      const out = {};
      out["sales-replay/replay"] = await bench.step(bench.tap("sales"), {
        domQuietMs: 2000,
        networkQuietMs: NETWORK_QUIET_MS,
        until: () => bench.page.waitForSelector(`${VISIBLE_PAGE} .count`, { timeout: STEP_TIMEOUT_MS }),
        extra: async () => {
          const texts = await bench.page.evaluate(() => window.__countTexts);
          return { listCommits: texts.length, replayedItems: Number.parseInt(texts.at(-1) ?? "0", 10) || 0 };
        },
      });
      return out;
    } finally {
      await bench.close();
    }
  },

  async "round-tap"(context) {
    const bench = await newSession(context, { injectCount: 0 });
    try {
      const out = {};
      const rows = `${VISIBLE_PAGE} .round-row`;
      out["round-tap/open"] = await bench.step(
        async () => {
          await bench.page.evaluate(() => {
            window.__lastMutation = performance.now();
            window.location.hash = "#/tabs/plants/water";
          });
        },
        {
          networkQuietMs: NETWORK_QUIET_MS,
          until: () => bench.page.waitForSelector(rows, { timeout: STEP_TIMEOUT_MS }),
        },
      );
      for (let tap = 1; tap <= ROUND_TAPS; tap++) {
        out[`round-tap/tap-${String(tap).padStart(2, "0")}`] = await bench.step(async () => {
          const ok = await bench.page.evaluate(
            ({ selector, index }) => {
              const box = document.querySelectorAll(`${selector} .tick-box`)[index];
              if (!box) return false;
              window.__lastMutation = performance.now();
              box.click();
              return true;
            },
            { selector: rows, index: tap - 1 },
          );
          if (!ok) throw new Error(`Watering round has no row ${tap}`);
        });
      }
      return out;
    } finally {
      await bench.close();
    }
  },

  async "heap-20-switches"(context) {
    const bench = await newSession(context, { injectCount: 0 });
    try {
      for (const tab of SWITCH_ROUTE) await bench.step(bench.tap(tab), { networkQuietMs: NETWORK_QUIET_MS });
      const before = await bench.heapUsageMb();
      for (let index = 0; index < SWITCHES; index++) {
        await bench.step(bench.tap(SWITCH_ROUTE[index % SWITCH_ROUTE.length]), { networkQuietMs: NETWORK_QUIET_MS });
      }
      const after = await bench.heapUsageMb();
      const domNodes = await bench.page.evaluate(() => document.querySelectorAll("*").length);
      return {
        "heap-20-switches/switches": {
          heapBeforeMb: before,
          heapAfterMb: after,
          heapGrowthPct: before > 0 ? ((after - before) / before) * 100 : null,
          domNodes,
          requestsByPath: {},
        },
      };
    } finally {
      await bench.close();
    }
  },
};

const main = async () => {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(HELP);
    return;
  }
  const id = requireId(flags);
  if (typeof flags.url !== "string") throw new Error("Missing --url (the URL printed by serve-dist.mjs)");
  const requested = String(flags.scenario ?? "sales-entry").split(",");
  const chosen = requested.includes("all") ? SCENARIOS : requested;
  for (const name of chosen) {
    if (!SCENARIOS.includes(name)) throw new Error(`Unknown scenario "${name}" (${SCENARIOS.join(", ")}, all)`);
  }
  const runs = Number(flags.runs ?? 5);
  const explicitN = flags.n !== undefined;
  const n = Number(flags.n ?? 300);
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer");
  if (!Number.isInteger(n) || n < 0) throw new Error("--n must be a non-negative integer");
  const label = typeof flags.label === "string" ? flags.label : chosen.join("+");
  if (!/^[\w.+-]+$/.test(label)) throw new Error("--label may contain letters, digits, . _ + and -");

  const session = loadSession(id);
  const imageUrls = await fetchImageUrls(session.apiBase);
  const context = { url: flags.url, apiBase: session.apiBase, imageUrls, headed: flags.headed === true };

  const perRun = [];
  for (let run = 1; run <= runs; run++) {
    const record = {};
    for (const name of chosen) {
      console.log(`run ${run}/${runs}: ${name}`);
      Object.assign(record, await scenarios[name](context, n, explicitN));
    }
    perRun.push(record);
  }

  const result = {
    label,
    url: flags.url,
    scenarios: chosen,
    runs,
    n,
    date: new Date().toISOString(),
    steps: summarizeRuns(perRun),
    perRun,
  };

  const resultsDir = path.join(repoRoot, "scripts", "perf", "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const jsonPath = path.join(resultsDir, `${label}-navbench.json`);
  const markdown = toMarkdown(result);
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(resultsDir, `${label}-navbench.md`), `${markdown}\n`);
  console.log(`\n${markdown}`);
  console.log(`\nWrote ${jsonPath}`);

  if (typeof flags.compare === "string") {
    const baseline = JSON.parse(fs.readFileSync(path.resolve(flags.compare), "utf8"));
    console.log(compareToBaseline(result, baseline));
  }
  if (flags.targets) {
    const { text, failed } = evaluateTargets(result);
    console.log(text);
    if (failed > 0) process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
