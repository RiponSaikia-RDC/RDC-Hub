// Polls the hub Gmail inbox for new plant-staff email and turns it into
// ServiceRequests/Comments. See README.md's "Email intake (Gmail)" section
// for setup and server/src/lib/gmail.ts for the Gmail API wrapper this
// builds on.
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { prisma } from "./prisma";
import * as gmail from "./gmail";
import { InboundAttachment } from "./gmail";
import { matchQueryType } from "./emailRouter";
import { pickAssignee } from "./assignmentPicker";
import { nextTicketNumber } from "./ticketNumber";
import { cleanInboundText } from "./emailFormat";

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

// Outbound replies (see requests.ts) tag their subject with
// "Re: ... [TICKET-xxxx]" — if a mail client mangles Gmail's own thread
// tracking, we fall back to spotting that tag in an inbound subject.
const TICKET_TAG_RE = /\[([A-Za-z0-9-]+)\]/;

let timer: ReturnType<typeof setInterval> | null = null;
let sentinelPlantId: number | null = null;

/** The Plant used for tickets whose sender can't be tied to a real plant.
 * Seeded as code "EMAIL"; upserted here too in case a DB predates the seed change. */
async function getSentinelPlantId(): Promise<number> {
  if (sentinelPlantId) return sentinelPlantId;
  const plant = await prisma.plant.upsert({
    where: { code: "EMAIL" },
    update: {},
    create: { name: "Unspecified (via Email)", code: "EMAIL" },
  });
  sentinelPlantId = plant.id;
  return plant.id;
}

/** Finds the User matching an inbound sender's email, or creates a minimal
 * directory-only Plant Staff record for them (no password — Plant Staff
 * don't log in to the Hub, see auth.ts). */
async function findOrCreateRequester(fromEmail: string, fromName: string) {
  const existing = await prisma.user.findUnique({ where: { email: fromEmail } });
  if (existing) return existing;

  const base = (fromEmail.split("@")[0] || "plantstaff").replace(/[^a-z0-9._-]/gi, "").toLowerCase() || "plantstaff";
  let username = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.user.findUnique({ where: { username } })) {
    username = `${base}${++suffix}`;
  }

  return prisma.user.create({
    data: {
      name: fromName || fromEmail,
      email: fromEmail,
      username,
      passwordHash: null,
      role: "PLANT_STAFF",
      plantId: await getSentinelPlantId(),
      activated: false,
    },
  });
}

/** Writes inbound email attachments to server/uploads the same way
 * attachments.ts does for web uploads, and links them to the SR/comment. */
async function saveAttachments(
  srId: number,
  commentId: number | null,
  uploadedById: number,
  attachments: InboundAttachment[]
) {
  if (attachments.length === 0) return;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  for (const a of attachments) {
    const storedPath = `${crypto.randomBytes(16).toString("hex")}${path.extname(a.filename)}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, storedPath), a.content);
    // eslint-disable-next-line no-await-in-loop
    await prisma.attachment.create({
      data: {
        srId,
        commentId: commentId ?? undefined,
        filename: a.filename,
        storedPath,
        mimeType: a.contentType || "application/octet-stream",
        size: a.content.length,
        uploadedById,
      },
    });
  }
}

async function processMessage(id: string): Promise<void> {
  const already = await prisma.processedEmail.findUnique({ where: { gmailMessageId: id } });
  if (already) {
    await gmail.markAsRead(id).catch(() => {});
    return;
  }

  const email = await gmail.getMessageRaw(id);
  if (!email.fromEmail) {
    console.warn(`[emailPoller] Skipping message ${id} — no parseable From address`);
    await prisma.processedEmail.create({ data: { gmailMessageId: id } });
    await gmail.markAsRead(id);
    return;
  }

  // Match an existing ticket by Gmail thread id first, then by a
  // [TICKET-xxxx] tag in the subject as a fallback.
  let sr = await prisma.serviceRequest.findUnique({ where: { gmailThreadId: email.threadId } });
  if (!sr) {
    const tag = email.subject.match(TICKET_TAG_RE)?.[1];
    if (tag) {
      sr = await prisma.serviceRequest.findUnique({ where: { ticketNumber: tag } });
    }
  }

  const requester = await findOrCreateRequester(email.fromEmail, email.fromName);
  // Strips quoted thread history and rejoins hard-wrapped lines — see
  // emailFormat.ts for why raw mail text needs this before it's stored/shown.
  const cleanedBody = cleanInboundText(email.text) || "(no message body)";

  if (sr) {
    const comment = await prisma.comment.create({
      data: {
        srId: sr.id,
        authorId: requester.id,
        body: cleanedBody,
        source: "EMAIL",
        gmailMessageId: id,
      },
    });
    await saveAttachments(sr.id, comment.id, requester.id, email.attachments);

    const data: Record<string, unknown> = {
      lastEmailMessageId: email.messageId ?? sr.lastEmailMessageId,
    };
    if (!sr.gmailThreadId) data.gmailThreadId = email.threadId; // backfill if matched via tag only
    if (sr.status === "RESOLVED" || sr.status === "CLOSED") data.status = "IN_PROGRESS";
    await prisma.serviceRequest.update({ where: { id: sr.id }, data });
  } else {
    const { queryTypeId, matched } = await matchQueryType(email.subject, email.text);
    if (!queryTypeId) {
      // No active QueryType exists at all — extremely unlikely (seed
      // creates several) but nothing sane to route to. Leave unread so
      // it's retried once an admin adds a query type.
      console.error(`[emailPoller] No active QueryType to route message ${id} to. Leaving unread for retry.`);
      return;
    }
    // Keyword match -> auto-pick the least-loaded member with rights to
    // that query type, as before. No match -> leave unassigned so it's
    // visible/actionable by every Member (see requests.ts's GET / and
    // PATCH /:id), rather than silently auto-picking someone who may have
    // nothing to do with it. The request detail page then offers a "teach
    // routing" panel so whoever picks it up can wire up a keyword +
    // responsible person for next time.
    const assignedToId = matched ? await pickAssignee(queryTypeId) : null;
    const plantId = await getSentinelPlantId();

    // Ticket numbers are derived from a row count; retry on the rare race
    // (same pattern as requests.ts's POST /).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ticketNumber = await nextTicketNumber();
        // eslint-disable-next-line no-await-in-loop
        const created = await prisma.serviceRequest.create({
          data: {
            ticketNumber,
            subject: email.subject,
            body: cleanedBody,
            queryTypeId,
            plantId,
            requesterId: requester.id,
            assignedToId: assignedToId ?? undefined,
            source: "EMAIL",
            gmailThreadId: email.threadId,
            lastEmailMessageId: email.messageId,
            keywordMatched: matched,
            originalToRaw: email.toEmails.join(", ") || null,
            originalCcRaw: email.ccEmails.join(", ") || null,
          },
        });
        // eslint-disable-next-line no-await-in-loop
        await saveAttachments(created.id, null, requester.id, email.attachments);
        break;
      } catch (err: any) {
        if (err?.code === "P2002" && attempt < 2) continue;
        throw err;
      }
    }
  }

  await prisma.processedEmail.create({ data: { gmailMessageId: id } });
  await gmail.markAsRead(id);
}

async function poll(): Promise<void> {
  try {
    const unread = await gmail.listUnreadInboxMessages();
    for (const msg of unread) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await processMessage(msg.id);
      } catch (err) {
        console.error(`[emailPoller] Failed to process message ${msg.id}:`, err);
      }
    }
    await prisma.emailSyncStatus.upsert({
      where: { id: 1 },
      update: { lastPollAt: new Date(), lastSuccessAt: new Date(), lastError: null },
      create: { id: 1, lastPollAt: new Date(), lastSuccessAt: new Date() },
    });
  } catch (err: any) {
    console.error("[emailPoller] Poll failed:", err);
    await prisma.emailSyncStatus
      .upsert({
        where: { id: 1 },
        update: { lastPollAt: new Date(), lastError: err?.message ?? String(err) },
        create: { id: 1, lastPollAt: new Date(), lastError: err?.message ?? String(err) },
      })
      .catch(() => {});
  }
}

/** Starts polling on an interval (EMAIL_POLL_INTERVAL_MS, default 2min).
 * No-ops if Gmail isn't configured, so the app runs fine without it. */
export function startEmailPoller(): void {
  if (!gmail.isGmailConfigured) {
    console.log("[emailPoller] GMAIL_* env vars not set — email intake disabled.");
    return;
  }
  const intervalMs = Number(process.env.EMAIL_POLL_INTERVAL_MS) || 120000;
  console.log(`[emailPoller] Email intake enabled — polling every ${intervalMs / 1000}s.`);
  poll();
  timer = setInterval(poll, intervalMs);
}

export function stopEmailPoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
