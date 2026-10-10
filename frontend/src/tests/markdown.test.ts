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

  it("converts headings by level, never above h3", () => {
    expect(parse("# Care")).toBe('<div><h3 class="info-header">Care</h3></div>');
    expect(parse("## Light")).toBe('<div><h3 class="info-header">Light</h3></div>');
    expect(parse("### Water")).toBe('<div><h4 class="info-header">Water</h4></div>');
  });

  it("splits a heading glued to the previous word", () => {
    const html = parse("Bright light##Water\n\nWeekly");
    expect(html).toContain('<p class="info-text-paragraph">Bright light</p>');
    expect(html).toContain('<h3 class="info-header">Water</h3>');
  });

  it("groups consecutive dash items into one list", () => {
    expect(parse("- one\n- two")).toBe(
      '<div><ul class="info-list"><li class="info-item">one</li>' +
        '<li class="info-item">two</li></ul></div>',
    );
  });

  it("keeps the text on the line after a heading", () => {
    expect(parse("## Licht\nHelles Licht.")).toBe(
      '<div><h3 class="info-header">Licht</h3><p class="info-text-paragraph">Helles Licht.</p></div>',
    );
  });

  it("renders every section of a guide with its text", () => {
    expect(parse("## Licht\nHelles Licht.\n\n## Gießen\nWenig.")).toBe(
      '<div><h3 class="info-header">Licht</h3><p class="info-text-paragraph">Helles Licht.</p>' +
        '<h3 class="info-header">Gießen</h3><p class="info-text-paragraph">Wenig.</p></div>',
    );
  });

  it("renders a heading followed by one list of two items", () => {
    expect(parse("## Licht\n- a\n- b")).toBe(
      '<div><h3 class="info-header">Licht</h3><ul class="info-list">' +
        '<li class="info-item">a</li><li class="info-item">b</li></ul></div>',
    );
  });

  it("separates a paragraph and a list without a blank line", () => {
    expect(parse("Intro\n- a")).toBe(
      '<div><p class="info-text-paragraph">Intro</p><ul class="info-list">' +
        '<li class="info-item">a</li></ul></div>',
    );
    expect(parse("- a\nOutro")).toBe(
      '<div><ul class="info-list"><li class="info-item">a</li></ul>' +
        '<p class="info-text-paragraph">Outro</p></div>',
    );
  });

  it("keeps consecutive lines of a paragraph in one paragraph", () => {
    expect(parse("one\ntwo")).toBe('<div><p class="info-text-paragraph">one\ntwo</p></div>');
  });

  it("bolds the label of every line in a paragraph", () => {
    const html = parse("Licht: viel\nWasser: wenig");
    expect(html).toContain("<strong>Licht:</strong> viel");
    expect(html).toContain("<strong>Wasser:</strong> wenig");
  });

  it("renders no heading for an empty heading text", () => {
    expect(parse("##")).toBe("<div></div>");
    expect(parse("## ")).toBe("<div></div>");
    expect(parse("## Lic")).toContain('<h3 class="info-header">Lic</h3>');
  });

  it("handles CRLF line endings", () => {
    expect(parse("a\r\nb\r\n\r\n- x\r\n- y")).toBe(
      '<div><p class="info-text-paragraph">a\nb</p><ul class="info-list">' +
        '<li class="info-item">x</li><li class="info-item">y</li></ul></div>',
    );
  });

  it("does not take a bold label line for a list", () => {
    const html = parse("**Licht:** viel\n**Wasser:** wenig");
    expect(html).not.toContain("<ul");
    expect(html.match(/<p /g)).toHaveLength(1);
  });

  it("splits a list around a heading", () => {
    expect(parse("- a\n# h\n- b")).toBe(
      '<div><ul class="info-list"><li class="info-item">a</li></ul>' +
        '<h3 class="info-header">h</h3>' +
        '<ul class="info-list"><li class="info-item">b</li></ul></div>',
    );
  });

  it("keeps numbered and star items of one block in a single list", () => {
    expect(parse("1. a\n2. b")).toBe(
      '<div><ul class="info-list"><li class="info-item">a</li>' +
        '<li class="info-item">b</li></ul></div>',
    );
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
    expect(parse("## Lic")).toBe('<div><h3 class="info-header">Lic</h3></div>');
    expect(() => parse("- ite")).not.toThrow();
    expect(parse("- ite")).toContain('<li class="info-item">ite</li>');
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
      '<h3 class="info-header"><strong>Light</strong> &lt;b&gt;</h3>',
    );
  });
});
