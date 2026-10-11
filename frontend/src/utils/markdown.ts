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
    .replace(
      /\*\*\*(.*?)\*\*\*/g,
      '<strong class="info-strong"><em class="info-em">$1</em></strong>',
    )
    .replace(/\*\*(.*?)\*\*/g, '<strong class="info-strong">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="info-em">$1</em>')
    .replace(/^([\w\s/]+):/gm, '<strong class="info-strong">$1:</strong>');

const HEADING = /^(#{1,6})\s*(.*)$/;
const LIST_ITEM = /^([-*]|\d+\.)\s+/;

const renderBlock = (block: string): string => {
  let html = "";
  let paragraph: string[] = [];
  let items: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html += `<p class="info-text-paragraph">${renderInlines(paragraph.join("\n"))}</p>`;
    }
    paragraph = [];
  };
  const flushList = () => {
    if (items.length) {
      const lis = items.map((i) => `<li class="info-item">${renderInlines(i)}</li>`).join("");
      html += `<ul class="info-list">${lis}</ul>`;
    }
    items = [];
  };

  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph();
      flushList();
      const title = heading[2].trim();
      if (title) {
        const level = Math.max(3, Math.min(6, heading[1].length + 1));
        html += `<h${level} class="info-header">${renderInlines(title)}</h${level}>`;
      }
    } else if (LIST_ITEM.test(line)) {
      flushParagraph();
      items.push(line.replace(LIST_ITEM, ""));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return html;
};

/**
 * Converts the small Markdown subset the care guides use (headings, lists,
 * paragraphs, bold and italic) to HTML. The input is HTML-escaped first, so
 * model output can never inject markup. Headings render from h3 down because
 * the card's own section heading is the h2. Works on partial text, so it can be
 * called on the growing buffer of a stream.
 */
export const renderMarkdown = (markdown: string): string => {
  if (!markdown) return "";

  const text = escapeHtml(markdown).replace(/([a-z0-9])(###|##|#)/g, "$1\n\n$2");
  const html = text.split(/\n\n+/).map(renderBlock).join("");

  return `<div>${html}</div>`;
};
