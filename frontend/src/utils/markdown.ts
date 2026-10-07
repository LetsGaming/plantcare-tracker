const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

const renderInlines = (text: string): string =>
  text
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^([\w\s/]+):/gm, "<strong>$1:</strong>");

/**
 * Converts the small Markdown subset the care guides use (headings, lists,
 * paragraphs, bold and italic) to HTML. The input is HTML-escaped first, so
 * model output can never inject markup. Works on partial text, so it can be
 * called on the growing buffer of a stream.
 */
export const renderMarkdown = (markdown: string): string => {
  if (!markdown) return "";

  const text = escapeHtml(markdown)
    .replace(/([a-z0-9])(###|##|#)/g, "$1\n\n$2")
    .replace(/(\n- )/g, "\n\n- ");

  let html = "";

  for (const block of text.split(/\n\n+/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#")) {
      const match = trimmed.match(/^(#+)\s*(.*)/);
      if (match) {
        const level = match[1].length;
        html += `<h${level} class="info-header">${renderInlines(match[2])}</h${level}>`;
        continue;
      }
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+\./.test(trimmed)) {
      html += '<ul class="info-list">';
      for (const item of trimmed.split(/\n/)) {
        const content = item.replace(/^([-*]|\d+\.)\s*/, "");
        html += `<li class="info-item">${renderInlines(content)}</li>`;
      }
      html += "</ul>";
      continue;
    }

    html += `<p class="info-text-paragraph">${renderInlines(trimmed)}</p>`;
  }

  return `<div>${html}</div>`;
};
