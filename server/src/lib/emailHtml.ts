// Turns an inbound email's HTML body into a *curated* rich-text fragment
// safe to render in the Hub UI: keeps bold/italic/underline, colours and
// highlight, lists, tables, links and quote blocks; drops images (broken
// `cid:` logos), scripts/styles, tracking pixels, and - as far as
// heuristics allow - the sender's signature block and the quoted history of
// earlier messages (the Hub already keeps that history as separate
// comments). See gmail.ts (which calls this) and emailFormat.ts (the
// plain-text equivalent, still produced alongside for search/previews).
import sanitizeHtml from "sanitize-html";

// Container markers that begin a quoted earlier message or a signature.
// Everything from the earliest match onward is cut before sanitising.
// Matched against the raw HTML - these class/id hooks are stable across
// Gmail and Outlook versions; text markers cover mailing-list footers.
const CUT_MARKERS: RegExp[] = [
  /<div[^>]*\bclass\s*=\s*"[^"]*\bgmail_quote(_container)?\b/i,
  /<div[^>]*\bclass\s*=\s*"[^"]*\bgmail_signature\b/i,
  /<div[^>]*\bclass\s*=\s*"[^"]*\bgmail_attr\b/i,
  // Gmail's "-- <br>" signature separator, inserted right before the
  // gmail_signature block (which may itself be absent on a short reply).
  /<span[^>]*>\s*--\s*<\/span>\s*<br\s*\/?>/i,
  /<blockquote[^>]*\btype\s*=\s*"cite"/i,
  /<div[^>]*\bid\s*=\s*"(appendonsend|Signature|divRplyFwdMsg|mail-editor-reference-message-container|ms-outlook-mobile-signature)"/i,
  /<hr[^>]*\bid\s*=\s*"[^"]*divRplyFwdMsg/i,
  // Outlook desktop's reply separator ("border-top: solid #E1E1E1 1.0pt")
  /<div[^>]*style\s*=\s*"[^"]*border-top:\s*solid\s*#e1e1e1/i,
  // Word/Outlook quoted header block ("From: ... Sent: ... To: ...")
  /<p[^>]*class\s*=\s*"[^"]*MsoNormal[^"]*"[^>]*>(\s|<[^>]+>|&nbsp;)*From:\s*<?/i,
  // "On <date>, <name> wrote:" attribution line, however it's wrapped
  /<[^>]+>\s*On\b[^<]{0,200}\bwrote:\s*<\/(div|p|span)>/i,
  // Mailing-list / Google Groups footers
  /You received this message because you are subscribed/i,
  /To unsubscribe from this group/i,
];

/** Cuts the raw HTML at the earliest quoted-message / signature marker. */
function cutQuotedAndSignature(rawHtml: string): string {
  let cut = -1;
  for (const re of CUT_MARKERS) {
    const m = re.exec(rawHtml);
    if (m && (cut === -1 || m.index < cut)) cut = m.index;
  }
  // The RFC 3676 "-- " signature delimiter on a line of its own - only
  // honoured when it's well into the body (never near the very top, where a
  // stray "--" would be real content).
  const sigDelim =
    /(?:<br\s*\/?>|<\/p>|<\/div>|\n)\s*(?:<[^>]+>\s*)*--\s*(?:<\/[^>]+>\s*)*(?:<br\s*\/?>|<\/p>|<\/div>|\n)/i.exec(rawHtml);
  if (sigDelim && sigDelim.index > 40 && (cut === -1 || sigDelim.index < cut)) {
    cut = sigDelim.index;
  }
  return cut === -1 ? rawHtml : rawHtml.slice(0, cut);
}

const COLOUR = [/^#(0x)?[0-9a-f]{3,8}$/i, /^rgba?\([\d.,\s%]+\)$/i, /^hsla?\([\d.,\s%]+\)$/i, /^[a-z]+$/i];

const SANITISE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "div", "span", "br", "hr",
    "b", "strong", "i", "em", "u", "s", "strike", "del", "ins", "sub", "sup", "mark", "small",
    "ul", "ol", "li", "dl", "dt", "dd",
    "blockquote", "pre", "code",
    "a",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    td: ["colspan", "rowspan", "align", "valign"],
    th: ["colspan", "rowspan", "align", "valign", "scope"],
    table: ["border", "cellpadding", "cellspacing"],
    col: ["span"],
    "*": ["style"],
  },
  allowedStyles: {
    "*": {
      color: COLOUR,
      "background-color": COLOUR,
      background: COLOUR,
      "font-weight": [/^(bold|bolder|lighter|normal|[1-9]00)$/i],
      "font-style": [/^(italic|oblique|normal)$/i],
      "text-decoration": [/^(underline|overline|line-through|none)(\s+\S+)*$/i],
      "text-decoration-line": [/^(underline|overline|line-through|none)$/i],
      "text-align": [/^(left|right|center|justify)$/i],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { a: ["http", "https", "mailto", "tel"] },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
  // Images, scripts, styles, remote objects: gone entirely (tags and text).
  nonTextTags: ["style", "script", "textarea", "option", "noscript", "head", "title"],
  disallowedTagsMode: "discard",
};

// U+00A0 (non-breaking space) and U+200B (zero-width space) turn up on
// otherwise-empty lines after an HTML-to-fragment conversion.
const WS = "\\s\\u00a0\\u200b";
const EMPTY_CONTAINER = new RegExp(`<(p|div|span)\\b[^>]*>(?:[${WS}]|&nbsp;|<br\\s*/?>)*</\\1>`, "gi");
const MANY_BRS = /(?:<br\s*\/?>\s*){3,}/gi;
const TRAILING_SIG_DELIM = /(?:<span\b[^>]*>)?\s*--\s*(?:<\/span>)?\s*(?:<br\s*\/?>\s*)*(?=(?:<\/(?:div|p|span)>\s*)*$)/i;
const TRAILING_BRS = /(?:<br\s*\/?>\s*)+(?=(?:<\/(?:div|p|span)>\s*)*$)/i;
const LEADING_WS = new RegExp(`^(?:[${WS}]|&nbsp;|<br\\s*/?>)+`, "i");
const TRAILING_WS = new RegExp(`(?:[${WS}]|&nbsp;|<br\\s*/?>)+$`, "i");

/** Removes empty spacer paragraphs / long <br> runs left after cutting and
 * sanitising, plus a dangling "-- " signature separator stranded at the end
 * when the gmail_signature block after it was cut. Looped a few times since
 * removing an inner empty div can expose an outer one. */
function tidy(html: string): string {
  let out = html;
  for (let i = 0; i < 5; i++) {
    const before = out;
    out = out
      .replace(EMPTY_CONTAINER, "")
      .replace(MANY_BRS, "<br><br>")
      .replace(TRAILING_SIG_DELIM, "")
      .replace(TRAILING_BRS, "")
      .replace(LEADING_WS, "")
      .replace(TRAILING_WS, "")
      .trim();
    if (out === before) break;
  }
  return out;
}

/** True if the fragment has visible text once tags are removed. */
function hasVisibleText(html: string): boolean {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().length > 0;
}

/** Full pipeline: cut quoted/sig blocks -> sanitise to the curated allowlist
 * -> tidy whitespace. Returns "" when there's no rich content worth keeping
 * (plain-text mail, or an all-image/all-signature body), so callers can
 * fall back to the plain-text body. */
export function curateInboundHtml(rawHtml: string | null | undefined): string {
  if (!rawHtml) return "";
  const cut = cutQuotedAndSignature(rawHtml);
  const clean = tidy(sanitizeHtml(cut, SANITISE_OPTS));
  return hasVisibleText(clean) ? clean : "";
}
