import { describe, it, expect } from "vitest";
import { formSnapshot, hasFormValue, safeRedirectPath } from "@/utils/formState";
import { checkImageFile, formatFileSize, MAX_IMAGE_BYTES } from "@/utils/imageValidation";
import { parsePart, selectionIsValid } from "@/utils/substrateParts";
import { categoryNameProblem, contrastTextColor } from "@/utils/categoryColors";

describe("safeRedirectPath", () => {
  it("accepts in-app paths only", () => {
    expect(safeRedirectPath("/tabs/plants?x=1")).toBe("/tabs/plants?x=1");
    expect(safeRedirectPath(["/tabs/plants"])).toBe("/tabs/plants");
    expect(safeRedirectPath("//evil.example")).toBeNull();
    expect(safeRedirectPath("https://evil.example")).toBeNull();
    expect(safeRedirectPath("/\\evil")).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
  });
});

describe("hasFormValue", () => {
  it("counts zero and false as answers", () => {
    expect(hasFormValue(0)).toBe(true);
    expect(hasFormValue(false)).toBe(true);
    expect(hasFormValue("  ")).toBe(false);
    expect(hasFormValue("")).toBe(false);
    expect(hasFormValue(undefined)).toBe(false);
    expect(hasFormValue(Number.NaN)).toBe(false);
  });
});

describe("formSnapshot", () => {
  it("changes when a value changes and ignores key order", () => {
    expect(formSnapshot({ a: 1, b: 2 })).toBe(formSnapshot({ b: 2, a: 1 }));
    expect(formSnapshot({ a: 1 })).not.toBe(formSnapshot({ a: 2 }));
  });

  it("tells files apart by name and size", () => {
    const first = new File(["a"], "one.png", { type: "image/png" });
    const second = new File(["ab"], "one.png", { type: "image/png" });
    expect(formSnapshot({ image: first })).not.toBe(formSnapshot({ image: second }));
  });
});

describe("checkImageFile", () => {
  it("rejects other types and oversized files", () => {
    expect(checkImageFile({ type: "image/png", size: 10 })).toBeNull();
    expect(checkImageFile({ type: "image/jpeg", size: 10 })).toBeNull();
    expect(checkImageFile({ type: "text/plain", size: 10 })).toBe("type");
    expect(checkImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toBe("size");
  });

  it("formats sizes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("substrate parts", () => {
  it("parses positive numbers with a decimal comma and rejects the rest", () => {
    expect(parsePart("1,5")).toBe(1.5);
    expect(parsePart(2)).toBe(2);
    expect(parsePart("0")).toBeNull();
    expect(parsePart("-1")).toBeNull();
    expect(parsePart("abc")).toBeNull();
    expect(parsePart("")).toBeNull();
    expect(parsePart(undefined)).toBeNull();
  });

  it("needs a selection with a usable part for every selected component", () => {
    expect(selectionIsValid([], {})).toBe(false);
    expect(selectionIsValid([1, 2], { 1: "2", 2: "" })).toBe(false);
    expect(selectionIsValid([1, 2], { 1: "2", 2: 0.5 })).toBe(true);
  });
});

describe("category helpers", () => {
  it("flags empty and duplicate names", () => {
    expect(categoryNameProblem("  ", [])).toBe("empty");
    expect(categoryNameProblem("Herbs", ["herbs"])).toBe("duplicate");
    expect(categoryNameProblem("Ferns", ["Herbs"])).toBeNull();
  });

  it("picks a light text color on dark backgrounds", () => {
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(red(contrastTextColor("#000000"))).toBeGreaterThan(0x80);
    expect(contrastTextColor("#ffffff")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
