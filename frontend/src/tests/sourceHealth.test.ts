import { describe, it, expect } from "vitest";
import SourceHealthMapper from "@/mapping/SourceHealthMapping";
import { resolveAccess, type AccessChecks } from "@/router/guards";

const row = (overrides: Partial<APISourceHealth> = {}): APISourceHealth => ({
  source_key: "jungleLeaves",
  kind: "sales",
  seller: "Jungle Leaves",
  status: "ok",
  active_strategy: "shopifyJson",
  last_item_count: 3,
  consecutive_failures: 0,
  last_success_at: "2026-10-06T10:00:00.000Z",
  last_failure_at: null,
  last_error: null,
  updated_at: "2026-10-06T10:00:00.000Z",
  ...overrides,
});

describe("SourceHealthMapper", () => {
  it("maps API fields to the frontend model and turns nulls into undefined", () => {
    expect(SourceHealthMapper.mapSourceHealth(row())).toEqual({
      key: "jungleLeaves",
      kind: "sales",
      seller: "Jungle Leaves",
      status: "ok",
      strategy: "shopifyJson",
      itemCount: 3,
      consecutiveFailures: 0,
      lastSuccessAt: "2026-10-06T10:00:00.000Z",
      lastFailureAt: undefined,
      lastError: undefined,
      issues: [],
    });
  });

  it("carries the field issues of a degraded source", () => {
    const issues: SourceIssue[] = [{ code: "images_missing", affected: 3, total: 3 }];
    expect(SourceHealthMapper.mapSourceHealth(row({ status: "degraded", issues })).issues).toEqual(
      issues,
    );
  });

  it("keeps a null strategy and item count for sources that never produced data", () => {
    const mapped = SourceHealthMapper.mapSourceHealth(
      row({ status: "failing", active_strategy: null, last_item_count: null }),
    );
    expect(mapped.strategy).toBeNull();
    expect(mapped.itemCount).toBeNull();
  });

  it("orders failing before degraded before unknown before ok, then by seller", () => {
    const sorted = SourceHealthMapper.convertToSourceHealth([
      row({ source_key: "a", seller: "Zeta", status: "ok" }),
      row({ source_key: "b", seller: "Beta", status: "unknown" }),
      row({ source_key: "c", seller: "Gamma", status: "failing" }),
      row({ source_key: "d", seller: "Alpha", status: "failing" }),
      row({ source_key: "e", seller: "Delta", status: "degraded" }),
    ]);
    expect(sorted.map((s) => s.key)).toEqual(["d", "c", "e", "b", "a"]);
  });
});

describe("resolveAccess", () => {
  const checks = (auth: boolean, admin: boolean): AccessChecks => ({
    isAuthenticated: async () => auth,
    isAdmin: async () => admin,
  });

  it("allows routes that need no authentication without checking anything", async () => {
    const never: AccessChecks = {
      isAuthenticated: () => Promise.reject(new Error("must not be called")),
      isAdmin: () => Promise.reject(new Error("must not be called")),
    };
    await expect(resolveAccess({}, never)).resolves.toBe("allow");
    await expect(resolveAccess({ requiresAuth: false }, never)).resolves.toBe("allow");
  });

  it("sends anonymous users to the login page", async () => {
    await expect(resolveAccess({ requiresAuth: true }, checks(false, false))).resolves.toBe(
      "login",
    );
    await expect(
      resolveAccess({ requiresAuth: true, requiresAdmin: true }, checks(false, false)),
    ).resolves.toBe("login");
  });

  it("allows signed-in users on authenticated routes", async () => {
    await expect(resolveAccess({ requiresAuth: true }, checks(true, false))).resolves.toBe("allow");
  });

  it("sends signed-in non-admins away from admin routes", async () => {
    await expect(
      resolveAccess({ requiresAuth: true, requiresAdmin: true }, checks(true, false)),
    ).resolves.toBe("home");
  });

  it("allows admins on admin routes", async () => {
    await expect(
      resolveAccess({ requiresAuth: true, requiresAdmin: true }, checks(true, true)),
    ).resolves.toBe("allow");
  });
});
