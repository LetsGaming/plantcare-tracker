import { createRequire } from "node:module";
import path from "node:path";
import { repoRoot } from "./session.mjs";

export const VIEWPORT = { width: 390, height: 844 };
export const DEVICE_SCALE_FACTOR = 3;
export const CPU_THROTTLE_RATE = 4;
export const NETWORK_FAST_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
  uploadThroughput: Math.round((750 * 1024) / 8),
};

const INIT_SCRIPT = `
(() => {
  window.__longtasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longtasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}
})();
`;

const loadPlaywright = () => {
  const require = createRequire(path.join(repoRoot, "backend", "package.json"));
  try {
    return require("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed. Run: pnpm --dir backend add -D playwright (and, without Microsoft Edge: pnpm --dir backend exec playwright install chromium)",
    );
  }
};

const launch = async (chromium, headless) => {
  try {
    return { browser: await chromium.launch({ channel: "msedge", headless }), name: "msedge" };
  } catch {
    try {
      return { browser: await chromium.launch({ headless }), name: "chromium" };
    } catch (error) {
      throw new Error(
        `Neither Microsoft Edge nor bundled Chromium could be launched (${error.message}). Install Edge or run: pnpm --dir backend exec playwright install chromium`,
      );
    }
  }
};

export const throttle = async (client, { cpu = CPU_THROTTLE_RATE, network = NETWORK_FAST_4G } = {}) => {
  await client.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", network);
};

/** Fresh mobile context per call. Long tasks are buffered in window.__longtasks. */
export const openPage = async ({ headless = true, throttled = true } = {}) => {
  const { chromium } = loadPlaywright();
  const { browser, name } = await launch(chromium, headless);
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  await context.addInitScript(INIT_SCRIPT);
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  if (throttled) await throttle(client);
  return {
    browser,
    context,
    page,
    client,
    name,
    close: async () => {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
};
