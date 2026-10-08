/**
 * Tests for the Markdown renderer behind the care guides, including the
 * escaping of model output.
 */

import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/utils/markdown";

const parse = renderMarkdown;

describe("renderMarkdown", () => {
  it("returns an empty string for empty input", () => {
    expect(parse("")).toBe("");
  });

  it("converts headings by level", () => {
    expect(parse("## Light")).toBe('<div><h2 class="info-header">Light</h2></div>');
    expect(parse("### Water")).toBe('<div><h3 class="info-header">Water</h3></div>');
  });

  it("splits a heading glued to the previous word", () => {
    const html = parse("Bright light##Water\n\nWeekly");
    expect(html).toContain('<p class="info-text-paragraph">Bright light</p>');
    expect(html).toContain('<h2 class="info-header">Water</h2>');
  });

  it("wraps each dash item in its own list because blank lines are inserted before items", () => {
    expect(parse("- one\n- two")).toBe(
      '<div><ul class="info-list"><li class="info-item">one</li></ul>' +
        '<ul class="info-list"><li class="info-item">two</li></ul></div>',
    );
  });

  it("keeps numbered and star items of one block in a single list", () => {
    expect(parse("1. first\n2. second")).toBe(
      '<div><ul class="info-list"><li class="info-item">first</li>' +
        '<li class="info-item">second</li></ul></div>',
    );
    expect(parse("* star")).toContain('<li class="info-item">star</li>');
  });

  it("converts bold, italic and bold italic", () => {
    const html = parse("**bold** *em* ***both***");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>em</em>");
    expect(html).toContain("<strong><em>both</em></strong>");
  });

  it("bolds a leading label before a colon", () => {
    expect(parse("Light: bright")).toContain("<strong>Light:</strong> bright");
  });

  it("renders a partially streamed buffer without throwing", () => {
    expect(() => parse("## Lig")).not.toThrow();
    expect(parse("## Lig")).toContain("Lig");
  });

  it("escapes raw HTML in model output", () => {
    const html = parse('<img src=x onerror="alert(1)"> & <script>x</script>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&amp;");
  });

  it("still applies markdown after escaping", () => {
    expect(parse("## **Light** <b>")).toContain(
      '<h2 class="info-header"><strong>Light</strong> &lt;b&gt;</h2>',
    );
  });
});
