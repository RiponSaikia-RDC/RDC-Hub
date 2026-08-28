import { useMemo } from "react";
import DOMPurify from "dompurify";

// Renders an inbound email body. When the server produced a curated
// rich-text version (bodyHtml — bold/colours/lists/tables/links kept,
// images/scripts/signature/quoted-history already stripped), re-sanitise it
// here with DOMPurify as defence-in-depth before it touches the DOM, then
// render it. Otherwise fall back to the plain-text body with newlines kept.

const ALLOWED_TAGS = [
  "p", "div", "span", "br", "hr",
  "b", "strong", "i", "em", "u", "s", "strike", "del", "ins", "sub", "sup", "mark", "small",
  "ul", "ol", "li", "dl", "dt", "dd",
  "blockquote", "pre", "code", "a",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
];

const ALLOWED_ATTR = [
  "href", "target", "rel", "style",
  "colspan", "rowspan", "align", "valign", "scope", "span",
  "border", "cellpadding", "cellspacing",
];

export function RichText({
  html,
  text,
  className = "",
}: {
  html?: string | null;
  text: string;
  className?: string;
}) {
  const clean = useMemo(() => {
    if (!html) return null;
    const sanitised = DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["style", "script", "img", "iframe", "form", "input"],
    });
    if (!sanitised.replace(/<[^>]+>/g, "").replace(/&nbsp;|\s/g, "").length) return null;
    // Let wide tables (the attendance reports) scroll inside their own box
    // instead of stretching the card — see .table-scroll in index.css.
    return sanitised
      .replace(/<table(\s|>)/gi, '<div class="table-scroll"><table$1')
      .replace(/<\/table>/gi, "</table></div>");
  }, [html]);

  if (clean) {
    return (
      <div
        className={`hub-rich-text ${className}`.trim()}
        // Safe: server-sanitised (sanitize-html allowlist) then re-sanitised
        // above with DOMPurify. No scripts/handlers/styles survive either pass.
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }
  return <p className={`whitespace-pre-wrap ${className}`.trim()}>{text}</p>;
}
