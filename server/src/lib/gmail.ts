// Gmail API integration for the email-intake workflow: a dedicated Gmail
// mailbox (GMAIL_HUB_EMAIL) receives plant-staff email, this module reads
// it and sends replies. See server/src/lib/emailPoller.ts for how it's
// used, and README.md's "Email intake (Gmail)" section for setup.
//
// Two auth models are supported, tried in this order:
//
//  1. Service account + domain-wide delegation (GMAIL_SERVICE_ACCOUNT_KEY_PATH).
//     Recommended for a real rdc.in Workspace mailbox: a Workspace admin
//     authorizes the service account once (no OAuth consent screen, no
//     "Testing" mode, no refresh token to expire), and the service account
//     impersonates GMAIL_HUB_EMAIL directly — mail is authenticated AND
//     sent as that mailbox itself, so no Gmail "send as" alias is needed
//     either. See README.md's "Email intake (Gmail)" section for the
//     one-time setup steps.
//  2. OAuth2 "installed app" (loopback) flow (GMAIL_CLIENT_ID/SECRET/
//     REFRESH_TOKEN) — the original personal-account flow, run once via
//     server/src/scripts/gmailAuth.ts to mint a refresh token stored in
//     .env. Simpler to set up but the refresh token expires after ~7 days
//     while the Google Cloud OAuth app is in "Testing" publishing status,
//     and mail sends as whichever account did the OAuth consent (with that
//     account's name/address) unless it has a verified "send as" alias for
//     GMAIL_HUB_EMAIL.
//
// No SMTP is involved either way — sending goes through the Gmail API too,
// via a MIME message built with nodemailer's MailComposer.
import crypto from "crypto";
import { google, gmail_v1 } from "googleapis";
import { simpleParser, ParsedMail, AddressObject } from "mailparser";
import { convert as htmlToText } from "html-to-text";
import { curateInboundHtml } from "./emailHtml";
import MailComposer = require("nodemailer/lib/mail-composer");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const HUB_EMAIL = process.env.GMAIL_HUB_EMAIL;
const SERVICE_ACCOUNT_KEY_PATH = process.env.GMAIL_SERVICE_ACCOUNT_KEY_PATH;

// Full Gmail access — matches the scope gmailAuth.ts's OAuth flow requests,
// so either auth model can read, modify labels, and send.
const GMAIL_SCOPES = ["https://mail.google.com/"];

const usingServiceAccount = Boolean(SERVICE_ACCOUNT_KEY_PATH && HUB_EMAIL);

/** True once enough GMAIL_* env vars are set for one of the two auth
 * models above. Every function below is a no-op (or throws, for callers
 * that must check first) when this is false, so the app runs fine with
 * the feature unconfigured. */
export const isGmailConfigured = usingServiceAccount || Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN && HUB_EMAIL);

let cachedClient: gmail_v1.Gmail | null = null;

function getClient(): gmail_v1.Gmail {
  if (!isGmailConfigured) {
    throw new Error(
      "Gmail is not configured — set GMAIL_SERVICE_ACCOUNT_KEY_PATH+GMAIL_HUB_EMAIL, or GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET/GMAIL_REFRESH_TOKEN/GMAIL_HUB_EMAIL, in .env"
    );
  }
  if (cachedClient) return cachedClient;

  if (usingServiceAccount) {
    const authClient = new google.auth.JWT({
      keyFile: SERVICE_ACCOUNT_KEY_PATH,
      scopes: GMAIL_SCOPES,
      // Domain-wide delegation: impersonate the hub mailbox itself rather
      // than the service account's own (non-mailbox) identity.
      subject: HUB_EMAIL,
    });
    cachedClient = google.gmail({ version: "v1", auth: authClient });
  } else {
    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    cachedClient = google.gmail({ version: "v1", auth: oauth2Client });
  }
  return cachedClient;
}

export interface InboundAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface InboundEmail {
  gmailMessageId: string;
  threadId: string;
  subject: string;
  /** Plain-text body — always present (converted from HTML if that's all
   * the sender shipped). Used for search, previews and keyword routing. */
  text: string;
  /** Curated, sanitised rich-text version of the HTML body — bold/colours/
   * lists/tables/links kept, images/scripts/signature/quoted-history
   * stripped (see emailHtml.ts). Empty string for plain-text-only mail. */
  html: string;
  fromName: string;
  fromEmail: string;
  date: Date | undefined;
  /** RFC822 Message-ID header, used for In-Reply-To/References chaining. */
  messageId: string | undefined;
  attachments: InboundAttachment[];
  /** Every address from the original To/Cc headers (lowercased), so
   * outbound replies can carry the rest of the original thread's
   * recipients forward as Cc. See ServiceRequest.originalToRaw/originalCcRaw. */
  toEmails: string[];
  ccEmails: string[];
}

/** mailparser's `to`/`cc` fields are a single AddressObject, or undefined
 * — flattens to a plain lowercased address list. */
function flattenAddresses(addr: AddressObject | AddressObject[] | undefined): string[] {
  if (!addr) return [];
  const objects = Array.isArray(addr) ? addr : [addr];
  return objects.flatMap((o) => o.value.map((v) => (v.address ?? "").toLowerCase())).filter(Boolean);
}

/** Lists unread messages in the inbox, excluding ones the hub account sent
 * itself (its own outbound replies), newest last-in-list-order from Gmail.
 *
 * Filtered to mail addressed to GMAIL_HUB_EMAIL (via Gmail's `to:`/`cc:`
 * operators) rather than every unread message in the inbox. This matters
 * when the polled mailbox is a real person's own inbox that merely
 * receives a forwarded copy of the hub address's mail (e.g. GMAIL_HUB_EMAIL
 * is a Google Group they belong to, not a dedicated mailbox) — without this
 * filter, their unrelated personal unread mail would get turned into
 * tickets too.
 *
 * Deliberately NOT using Gmail's `deliveredto:` operator here — Google
 * Groups rewrite the Delivered-To header to the final mailbox (the
 * watcher's own address) during expansion, not the group address, so
 * `deliveredto:<group>` never matches group-forwarded mail. `to:`/`cc:`
 * check the original To/Cc headers, which the group address does survive
 * in. Confirmed against a real mailbox with npm run gmail:diag. */
export async function listUnreadInboxMessages(): Promise<{ id: string; threadId: string }[]> {
  const gmail = getClient();
  const res = await gmail.users.messages.list({
    userId: "me",
    q: `in:inbox is:unread -from:me {to:${HUB_EMAIL} cc:${HUB_EMAIL}}`,
    maxResults: 25,
  });
  return (res.data.messages ?? []).map((m) => ({ id: m.id!, threadId: m.threadId! }));
}

/** Converts an HTML email body to plain text ourselves, rather than trusting
 * whichever plain-text alternative (if any) the sender's mail client
 * shipped alongside it. This matters because Outlook's own HTML->plain-text
 * downgrade renders bold/underline as literal `*word*`/`_word_` markers
 * (its long-standing Rich-Text-to-plain-text convention) — harmless in an
 * actual mail client that re-renders them, but confusing shown verbatim in
 * the Hub's plain "whatever's in the body" display. Converting the HTML
 * part ourselves with a converter that doesn't add those markers, and that
 * drops images/hrefs (a corporate signature's logo and tracking links are
 * noise here, not content — see the broken-looking bracketed URL a raw
 * conversion would otherwise leave behind), gives a clean read instead. */
function htmlToPlainText(html: string): string {
  return htmlToText(html, {
    wordwrap: false, // let emailFormat.ts's own paragraph handling apply, not this library's
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      // Render tables as aligned rows instead of concatenating every cell
      // into one unreadable run (the daily driver-attendance reports are
      // one big HTML table) — matters for search and the list preview,
      // which use this plain-text body. The rich view uses the HTML.
      { selector: "table", format: "dataTable" },
    ],
  });
}

/** Fetches and parses one message. Uses format=raw + mailparser rather than
 * hand-walking Gmail's MIME payload tree, so multipart/attachments/encoding
 * are handled for us. */
export async function getMessageRaw(id: string): Promise<InboundEmail> {
  const gmail = getClient();
  const res = await gmail.users.messages.get({ userId: "me", id, format: "raw" });
  const raw = res.data.raw;
  if (!raw) throw new Error(`Message ${id} had no raw content`);

  const buffer = Buffer.from(raw, "base64url");
  const parsed: ParsedMail = await simpleParser(buffer);

  const fromAddr = parsed.from?.value?.[0];
  const attachments: InboundAttachment[] = (parsed.attachments ?? []).map((a) => ({
    filename: a.filename || "attachment",
    content: a.content,
    contentType: a.contentType,
  }));

  // Prefer converting the HTML part ourselves (see htmlToPlainText above)
  // over whatever text/plain alternative the sender's client attached —
  // falling back to that alternative only when there's no HTML part at all.
  const text = parsed.html ? htmlToPlainText(parsed.html) : (parsed.text ?? "");
  const html = parsed.html ? curateInboundHtml(parsed.html) : "";

  return {
    gmailMessageId: id,
    threadId: res.data.threadId ?? id,
    subject: parsed.subject ?? "(no subject)",
    text: text.trim(),
    html,
    fromName: fromAddr?.name || fromAddr?.address || "Unknown",
    fromEmail: (fromAddr?.address || "").toLowerCase(),
    date: parsed.date,
    messageId: parsed.messageId,
    attachments,
    toEmails: flattenAddresses(parsed.to),
    ccEmails: flattenAddresses(parsed.cc),
  };
}

/** Message ids in a thread, oldest first — the first is the one that
 * created the ticket. Used by the bodyHtml backfill script. */
export async function listThreadMessageIds(threadId: string): Promise<string[]> {
  const gmail = getClient();
  const res = await gmail.users.threads.get({ userId: "me", id: threadId, format: "minimal" });
  return (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
}

/** Removes the UNREAD label so this message isn't picked up again next poll. */
export async function markAsRead(id: string): Promise<void> {
  const gmail = getClient();
  await gmail.users.messages.modify({ userId: "me", id, requestBody: { removeLabelIds: ["UNREAD"] } });
}

/** A file already sitting on disk (server/uploads/<storedPath>) to attach
 * to an outbound message — reuses the same file the Hub UI serves for
 * in-app download, no re-upload. */
export interface OutboundAttachment {
  filename: string;
  path: string;
  contentType?: string;
}

export interface SendReplyInput {
  /** Gmail thread id to send within. Omit to send as a standalone message
   * with its own subject line — which is what the Hub does now, so the
   * "[SR-n] Re: …" ticket tag shows in Gmail's conversation list instead of
   * being hidden behind the thread's original subject. The full prior
   * conversation is quoted in the body instead (see replyEmail.ts). */
  threadId?: string;
  to: string;
  /** Everyone else who should stay looped in — the original thread's other
   * recipients plus whatever the replying member added by hand. */
  cc?: string[];
  subject: string;
  text: string;
  /** HTML alternative of `text` — see emailFormat.ts's buildReplyHtml.
   * Optional so callers that only have plain text (e.g. system messages)
   * still work; when present, sent as multipart/alternative so HTML-
   * preferring clients (Outlook, Gmail) render it instead of raw text. */
  html?: string;
  /** RFC822 Message-ID of the message being replied to, if any. */
  inReplyTo?: string | null;
  references?: string | null;
  /** Files to attach, same ones stored for in-app download. Gmail's total
   * message size cap is 25MB; callers should keep the sum well under that
   * (see MAX_EMAIL_ATTACHMENT_BYTES in requests.ts) since an oversized send
   * fails outright rather than partially attaching. */
  attachments?: OutboundAttachment[];
}

export interface SendReplyResult {
  gmailMessageId: string;
  /** The RFC822 Message-ID we generated and set on the outbound mail —
   * store this as ServiceRequest.lastEmailMessageId for the next reply's
   * In-Reply-To/References chain. */
  messageId: string;
}

/** Sends a reply as the hub mailbox — as a standalone message unless a
 * threadId is given. */
export async function sendReply(input: SendReplyInput): Promise<SendReplyResult> {
  const gmail = getClient();
  const domain = HUB_EMAIL!.split("@")[1] || "rdchub.local";
  const messageId = `<${crypto.randomUUID()}@${domain}>`;

  const mail = new MailComposer({
    from: `RDC Hub <${HUB_EMAIL}>`,
    to: input.to,
    cc: input.cc?.length ? input.cc.join(", ") : undefined,
    subject: input.subject,
    text: input.text,
    html: input.html || undefined,
    messageId,
    inReplyTo: input.inReplyTo || undefined,
    references: input.references || undefined,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      path: a.path,
      contentType: a.contentType,
    })),
  });

  const rawBuffer: Buffer = await mail.compile().build();
  const raw = rawBuffer.toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: input.threadId ? { raw, threadId: input.threadId } : { raw },
  });

  return { gmailMessageId: res.data.id!, messageId };
}

/** Sends a standalone email as the hub mailbox — no thread/ticket
 * involved. Used for one-off notifications like a new Admin/Member's
 * activation OTP (see users.ts). Silently does nothing if Gmail isn't
 * configured, since OTPs are also always shown in the admin UI as a
 * fallback delivery path. */
export async function sendMail(input: { to: string; subject: string; text: string }): Promise<void> {
  if (!isGmailConfigured) return;
  const gmail = getClient();
  const mail = new MailComposer({
    from: `RDC Hub <${HUB_EMAIL}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
  const rawBuffer: Buffer = await mail.compile().build();
  const raw = rawBuffer.toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}
