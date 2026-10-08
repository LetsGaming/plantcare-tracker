/**
 * Source health re-check results, shared status helpers and sale price formatting.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInstalledPinia, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  isApiError: () => false,
  configureAuth: vi.fn(),
}));
vi.mock("@/utils/apiUtils", () => ({ default: api }));

import ToastService from "@/services/general/ToastService";
import { describeOutcome, useAdminHealthStore } from "@/stores/adminHealth";
import SaleMapper from "@/mapping/SaleMapping";
import { countByStatus, failureCause, statusRank, statusTone } from "@/utils/sourceStatus";
import { discountPercent, formatDiscount, formatPrice } from "@/utils/formatPrice";

const row = (key: string, status: string, kind = "sales"): APISourceHealth =>
  ({
    source_key: key,
    kind,
    seller: key,
    status,
    active_strategy: null,
    last_item_count: null,
    consecutive_failures: status === "failing" ? 2 : 0,
    last_success_at: null,
    last_failure_at: null,
    last_error: status === "failing" ? "boom" : null,
    updated_at: "2026-10-06T10:00:00.000Z",
  }) as APISourceHealth;

const apiError = (status: number) =>
  Object.assign(new Error("failed"), { name: "ApiError", status });

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("recheck results", () => {
  it("returns the recorded failing row without an error toast when the server answers 500", async () => {
    api.get.mockResolvedValue([row("a", "failing"), row("b", "ok", "sales")]);
    await createInstalledPinia();
    const store = useAdminHealthStore();
    await store.load();
    api.post.mockRejectedValue(apiError(500));

    const health = await store.recheck("a");

    expect(health.status).toBe("failing");
    expect(store.results.a.outcome).toBe("still_failing");
    expect(ToastService.showError).not.toHaveBeenCalled();
    expect(store.checking).toBeNull();
  });

  it("still reports a network error as a toast and rethrows", async () => {
    api.get.mockResolvedValue([row("a", "failing")]);
    await createInstalledPinia();
    const store = useAdminHealthStore();
    await store.load();
    api.post.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(store.recheck("a")).rejects.toThrow();
    expect(ToastService.showError).toHaveBeenCalledTimes(1);
  });

  it("records a recovery and keeps failing sources first", async () => {
    api.get.mockResolvedValue([row("a", "failing"), row("b", "failing"), row("c", "ok")]);
    await createInstalledPinia();
    const store = useAdminHealthStore();
    await store.load();
    api.post.mockResolvedValue(row("a", "ok"));

    await store.recheck("a");

    expect(store.results.a.outcome).toBe("recovered");
    expect(store.sources.map((s) => s.key)).toEqual(["b", "a", "c"]);
  });

  it("checks every sale source in sequence and reports progress", async () => {
    api.get.mockResolvedValue([
      row("a", "failing"),
      row("b", "degraded"),
      row("s", "ok", "search"),
    ]);
    await createInstalledPinia();
    const store = useAdminHealthStore();
    await store.load();
    api.post.mockImplementation(async (url: string) => row(url.split("/")[3], "ok"));

    const failed = await store.recheckAll();

    expect(failed).toBe(0);
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(store.batch).toBeNull();
    expect(store.needingAttention).toBe(0);
  });

  it("describes outcomes from the status before and after", () => {
    expect(describeOutcome("failing", "failing")).toBe("still_failing");
    expect(describeOutcome("ok", "failing")).toBe("now_failing");
    expect(describeOutcome("degraded", "ok")).toBe("recovered");
    expect(describeOutcome("ok", "ok")).toBe("ok");
    expect(describeOutcome("ok", "degraded")).toBe("degraded");
  });
});

describe("source status helpers", () => {
  it("maps one tone per status and ranks failing first", () => {
    expect(statusTone("failing")).toBe("danger");
    expect(statusTone("degraded")).toBe("warning");
    expect(statusTone("ok")).toBe("success");
    expect(statusRank("failing")).toBeLessThan(statusRank("degraded"));
    expect(statusRank("degraded")).toBeLessThan(statusRank("ok"));
  });

  it("counts sources by status", () => {
    expect(countByStatus([{ status: "ok" }, { status: "ok" }, { status: "failing" }])).toEqual({
      ok: 2,
      degraded: 0,
      failing: 1,
      unknown: 0,
    });
  });

  it("guesses a friendly cause from the raw error", () => {
    expect(failureCause("HTTP 403 Forbidden")).toBe("blocked");
    expect(failureCause("request timed out")).toBe("timeout");
    expect(failureCause("No strategy produced usable data")).toBe("layout");
    expect(failureCause(undefined)).toBe("layout");
  });
});

describe("sale prices", () => {
  it("formats currency with the locale so whole and fractional prices match", () => {
    expect(formatPrice(31, "de")).toBe("31,00 €");
    expect(formatPrice(15.2, "de")).toBe("15,20 €");
    expect(formatPrice(15.2, "en")).toBe("€15.20");
  });

  it("derives a whole-number discount only when the old price is higher", () => {
    expect(discountPercent(15.2, 26.7)).toBe(43);
    expect(discountPercent(10, 10)).toBe(0);
    expect(discountPercent(10, 0)).toBe(0);
    expect(formatDiscount(15.2, 26.7, "en")).toBe("-43%");
    expect(formatDiscount(10, 10, "en")).toBe("");
  });

  it("treats generated letter tiles as no photo", () => {
    const sale = (url: string | null) =>
      SaleMapper.mapSale({
        sale_id: "1",
        sale_name: "x",
        sale_seller: "s",
        sale_new_price: 1,
        sale_old_price: 2,
        sale_link: "l",
        sale_image_url: url,
      } as APISale);
    expect(sale("data:image/svg+xml;base64,AAA").imageUrl).toBeUndefined();
    expect(sale("https://cdn.example.com/a.webp").imageUrl).toBe("https://cdn.example.com/a.webp");
    expect(sale(null).imageUrl).toBeUndefined();
  });
});
