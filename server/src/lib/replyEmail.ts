// Builds the outbound reply email the Hub sends to plant staff.
//
// Replies go out as *standalone* messages (not threaded into the original
// Gmail conversation) so the "[SR-n] Re: ..." subject shows in Gmail's
// conversation list instead of being collapsed behind the thread's first
// subject. Because it's standalone, the whole prior conversation is quoted
// below the new reply as a "trail" so no context is lost.
import { escapeHtml } from "./emailFormat";

export interface TrailMessage {
  /** Display name of who wrote it. */
  author: string;
  email?: string | null;
  date: Date;
  /** Plain-text body of that message. */
  text: string;
  /** Curated rich-text body of that message, if it had one. */
  html?: string | null;
}

export interface BuildReplyEmailInput {
  /** The member's reply, sanitised HTML (see emailHtml.sanitizeOutboundHtml).
   * Empty string when the member typed plain text only. */
  replyHtml: string;
  /** The member's reply as plain text (always present). */
  replyText: string;
  /** e.g. "Ref: SR-12 - please keep this reference on any reply." */
  refLine: string;
  /** Optional note about attachments too large to email. */
  sizeNote?: string;
  /** Prior messages, newest first, NOT including the reply being sent. */
  trail: TrailMessage[];
}

function quotedHeaderLine(m: TrailMessage): string {
  const who = m.email ? `${m.author} <${m.email}>` : m.author;
  return `On ${m.date.toUTCString()}, ${who} wrote:`;
}

function textToParagraphsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const TRAIL_DIVIDER = "---------- Previous messages ----------";

export function buildReplyEmail(input: BuildReplyEmailInput): { text: string; html: string } {
  const { replyHtml, replyText, refLine, sizeNote, trail } = input;

  // ---- plain text ----
  const textParts: string[] = [replyText.trim()];
  if (sizeNote) textParts.push(sizeNote.trim());
  textParts.push(refLine);
  if (trail.length) {
    textParts.push(TRAIL_DIVIDER);
    for (const m of trail) {
      const quoted = m.text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
      textParts.push(`${quotedHeaderLine(m)}\n${quoted}`);
    }
  }
  const text = textParts.join("\n\n");

  // ---- html ----
  const replyHtmlBody = replyHtml || textToParagraphsHtml(replyText);
  const trailHtml = trail
    .map((m) => {
      const inner = m.html || textToParagraphsHtml(m.text);
      return `<blockquote style="margin:12px 0 0;padding:0 0 0 12px;border-left:3px solid #d1d5db;color:#6b7280;">
        <div style="font-size:12px;margin-bottom:6px;">${escapeHtml(quotedHeaderLine(m))}</div>
        ${inner}
      </blockquote>`;
    })
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
    ${replyHtmlBody}
    ${sizeNote ? `<p style="margin:12px 0 0;color:#6b7280;font-size:13px;">${escapeHtml(sizeNote.trim())}</p>` : ""}
    <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">${escapeHtml(refLine)}</p>
    ${
      trail.length
        ? `<p style="margin:16px 0 4px;color:#9ca3af;font-size:12px;">${escapeHtml(TRAIL_DIVIDER)}</p>${trailHtml}`
        : ""
    }
  </div>`;

  return { text, html };
}
