// Turns raw inbound plain text into something readable in the Hub UI, and
// turns a Hub reply into a properly formatted outbound email (text + HTML).
// Both directions need this because plain-text email in the wild is messier
// than it looks:
//
// 1. Many mail clients (classic Outlook in particular) hard-wrap plain text
//    at ~70-78 columns without marking the message `format=flowed`, so a
//    single sentence arrives as several short physical lines. Rendered with
//    `white-space: pre-wrap` (see RequestDetail.tsx), that shows up as a
//    ragged, broken-looking paragraph instead of one flowing line.
// 2. A reply typically carries the *entire* prior thread quoted below the
//    new text ("On ... wrote:", "-----Original Message-----", a block of
//    "From:/Sent:/To:/Subject:" headers, or a run of "> " quoted lines).
//    The Hub already keeps full thread history as separate comments, so
//    re-storing that quoted copy every time just duplicates it.

/** Lines that mark the start of a quoted/forwarded block in a reply. Cut
 * everything from the first match onward. Deliberately conservative — false
 * negatives (a quote block that slips through) are harmless, since the
 * quoted text simply shows up as visible content; false positives (cutting
 * real new content) are worse, so each pattern anchors on a whole line. */
const QUOTE_START_PATTERNS: RegExp[] = [
  /^[ \t]*On .{0,140} wrote:[ \t]*$/im,
  /^[ \t]*-{2,}[ \t]*Original Message[ \t]*-{2,}[ \t]*$/im,
  /^[ \t]*_{5,}[ \t]*$/m, // Outlook's separator line above quoted headers
  /^[ \t]*From:[ \t]*.+\r?\n[ \t]*Sent:[ \t]*.+\r?\n[ \t]*To:[ \t]*.+$/im,
  /^[ \t]*>.*$/m, // first "> "-quoted line
];

function stripQuotedReply(text: string): string {
  let cutAt = -1;
  for (const pattern of QUOTE_START_PATTERNS) {
    const match = pattern.exec(text);
    if (match && (cutAt === -1 || match.index < cutAt)) cutAt = match.index;
  }
  if (cutAt === -1) return text;
  const kept = text.slice(0, cutAt).trim();
  // If the whole message was quote (e.g. someone forwarded something with no
  // comment of their own), keep the original rather than storing "".
  return kept.length > 0 ? kept : text.trim();
}

/** Rejoins lines that look like they were hard-wrapped mid-sentence: the
 * previous line is long-ish and doesn't end with terminal punctuation, and
 * neither line is a quote/list/blank marker. Heuristic, not exact — the
 * goal is turning obviously-wrapped prose back into flowing paragraphs, not
 * perfectly reconstructing the original composition. */
function unwrapHardWrappedLines(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const isSpecial = (l: string) => /^\s*($|>|[-*•]\s|\d+[.)]\s)/.test(l);

  for (const line of lines) {
    const prev = out[out.length - 1];
    const canJoin =
      prev !== undefined &&
      prev.length >= 65 &&
      !isSpecial(prev) &&
      !isSpecial(line) &&
      !/[.:;!?"')\]]$/.test(prev.trimEnd());
    if (canJoin) {
      out[out.length - 1] = `${prev.trimEnd()} ${line.trim()}`;
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

/** Full cleanup pipeline for an inbound message body before it's stored as
 * a ServiceRequest/Comment body. Safe to call on an already-clean body
 * (e.g. nothing to unwrap) — it's a no-op in that case. */
export function cleanInboundText(raw: string): string {
  const stripped = stripQuotedReply(raw || "");
  return unwrapHardWrappedLines(stripped).trim();
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Renders a plain-text reply as simple, well-formatted HTML: paragraphs on
 * blank-line boundaries, single newlines within a paragraph become <br>.
 * Inline styles throughout (not a <style> block) since that's what survives
 * across Outlook/Gmail/webmail HTML sanitizers reliably. */
function textToHtmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 12px;">${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export interface ReplyHtmlInput {
  replyText: string;
  quoted?: { header: string; body: string } | null;
}

/** Builds the HTML alternative for an outbound reply: the new reply text as
 * normal paragraphs, followed by the quoted original in a Gmail-style
 * indented blockquote — instead of the plain-text version's "> "-prefixed
 * lines, which several mail clients (Outlook especially) render as a wall
 * of literal ">" characters rather than a visual quote. */
export function buildReplyHtml({ replyText, quoted }: ReplyHtmlInput): string {
  const body = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
      ${textToHtmlParagraphs(replyText)}
      ${
        quoted
          ? `<blockquote style="margin:16px 0 0;padding:0 0 0 12px;border-left:3px solid #d1d5db;color:#6b7280;">
               <div style="font-size:12px;margin-bottom:6px;">${escapeHtml(quoted.header)}</div>
               ${textToHtmlParagraphs(quoted.body)}
             </blockquote>`
          : ""
      }
    </div>`;
  return body;
}
