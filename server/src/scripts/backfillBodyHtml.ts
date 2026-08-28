// One-off backfill: re-fetch every email-sourced ServiceRequest and Comment
// from Gmail and populate the new `bodyHtml` column (curated rich text) —
// and refresh the plain-text `body` with the improved table rendering while
// we're at it. Safe to re-run; only touches source="EMAIL" rows.
//
//   npm run backfill:bodyhtml            (from server/)
//   npm run backfill:bodyhtml -- --dry   (report only, write nothing)
import "dotenv/config";
import { prisma } from "../lib/prisma";
import * as gmail from "../lib/gmail";
import { cleanInboundText } from "../lib/emailFormat";

const DRY = process.argv.includes("--dry");

async function main() {
  if (!gmail.isGmailConfigured) {
    console.error("Gmail is not configured (GMAIL_* env vars) — cannot backfill.");
    process.exit(1);
  }

  const requests = await prisma.serviceRequest.findMany({
    where: { source: "EMAIL", gmailThreadId: { not: null } },
    select: { id: true, ticketNumber: true, gmailThreadId: true },
  });
  console.log(`${requests.length} email-sourced requests to check${DRY ? " (dry run)" : ""}…`);

  let reqUpdated = 0;
  for (const sr of requests) {
    try {
      // The first message in the thread is the one that created the ticket.
      const msgs = await gmail.listThreadMessageIds(sr.gmailThreadId!);
      if (!msgs.length) {
        console.warn(`  ${sr.ticketNumber}: thread has no messages, skipping`);
        continue;
      }
      const email = await gmail.getMessageRaw(msgs[0]);
      const body = cleanInboundText(email.text) || "(no message body)";
      const bodyHtml = email.html || null;
      if (!DRY) {
        await prisma.serviceRequest.update({ where: { id: sr.id }, data: { body, bodyHtml } });
      }
      reqUpdated++;
      console.log(`  ${sr.ticketNumber}: bodyHtml ${bodyHtml ? `${bodyHtml.length} chars` : "none (plain text)"}`);
    } catch (err: any) {
      console.warn(`  ${sr.ticketNumber}: ${err?.message ?? err}`);
    }
  }

  const comments = await prisma.comment.findMany({
    where: { source: "EMAIL", gmailMessageId: { not: null } },
    select: { id: true, gmailMessageId: true, srId: true },
  });
  console.log(`\n${comments.length} email-sourced comments to check…`);

  let comUpdated = 0;
  for (const c of comments) {
    try {
      const email = await gmail.getMessageRaw(c.gmailMessageId!);
      const body = cleanInboundText(email.text) || "(no message body)";
      const bodyHtml = email.html || null;
      if (!DRY) {
        await prisma.comment.update({ where: { id: c.id }, data: { body, bodyHtml } });
      }
      comUpdated++;
      console.log(`  comment #${c.id} (SR ${c.srId}): bodyHtml ${bodyHtml ? `${bodyHtml.length} chars` : "none"}`);
    } catch (err: any) {
      console.warn(`  comment #${c.id}: ${err?.message ?? err}`);
    }
  }

  console.log(`\nDone. ${DRY ? "Would update" : "Updated"} ${reqUpdated} requests and ${comUpdated} comments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
