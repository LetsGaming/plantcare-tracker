import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { collectPages, isNotModified } from "@/stores/paged";

describe("isNotModified", () => {
  it("recognises the not modified sentinel only", () => {
    expect(isNotModified({ notModified: true })).toBe(true);
    expect(isNotModified({ items: [] })).toBe(false);
    expect(isNotModified(null)).toBe(false);
    expect(isNotModified(undefined)).toBe(false);
  });
});

describe("collectPages", () => {
  const pageOf = (items: number[], next: string | null, total?: number) => ({
    items,
    next_cursor: next,
    total,
  });
  type Page = ReturnType<typeof pageOf>;

  let fetchPage: Mock<(cursor: string | null) => Promise<Page | null>>;
  beforeEach(() => {
    fetchPage = vi.fn<(cursor: string | null) => Promise<Page | null>>();
  });

  it("walks every page and keeps the first page for its total", async () => {
    fetchPage
      .mockResolvedValueOnce(pageOf([1, 2], "a", 5))
      .mockResolvedValueOnce(pageOf([3, 4], "b"))
      .mockResolvedValueOnce(pageOf([5], null));
    const result = await collectPages<number, Page>(fetchPage);
    expect(result?.items).toEqual([1, 2, 3, 4, 5]);
    expect(result?.first.total).toBe(5);
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([null, "a", "b"]);
  });

  it("stops with null when the caller gives up", async () => {
    fetchPage.mockResolvedValueOnce(pageOf([1], "a")).mockResolvedValueOnce(null);
    expect(await collectPages<number, Page>(fetchPage)).toBeNull();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("throws on a repeated cursor instead of truncating", async () => {
    fetchPage.mockResolvedValue(pageOf([1], "same"));
    await expect(collectPages<number, Page>(fetchPage)).rejects.toThrow("cursor loop");
  });

  it("throws when the endpoint never ends", async () => {
    let n = 0;
    fetchPage.mockImplementation(async () => pageOf([1], `c${(n += 1)}`));
    await expect(collectPages<number, Page>(fetchPage)).rejects.toThrow("cursor loop");
  });
});
