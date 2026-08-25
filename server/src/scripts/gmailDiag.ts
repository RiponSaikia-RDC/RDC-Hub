// Diagnostic CLI for email intake: shows what's actually arriving at the
// watched mailbox and whether the poller's search query is matching it.
// Run with `npm run gmail:diag` from server/. Safe to run any time — it
// only reads, never marks anything read or modifies anything.
import "dotenv/config";
import { google } from "googleapis";

async function main() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_HUB_EMAIL } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_HUB_EMAIL) {
    console.error("GMAIL_* env vars aren't all set — nothing to check.");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const profile = await gmail.users.getProfile({ userId: "me" });
  console.log(`Authenticated as: ${profile.data.emailAddress}`);
  console.log(`GMAIL_HUB_EMAIL is set to: ${GMAIL_HUB_EMAIL}\n`);

  console.log("--- Last messages in this inbox, last 14 days (any read state) ---");
  const broad = await gmail.users.messages.list({ userId: "me", q: "in:inbox newer_than:14d", maxResults: 10 });
  if (!broad.data.messages?.length) {
    console.log("(none at all — nothing has landed in this inbox in the last 14 days)");
  }
  for (const m of broad.data.messages ?? []) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: m.id!,
      format: "metadata",
      metadataHeaders: ["From", "To", "Delivered-To", "Subject", "Date"],
    });
    const h = Object.fromEntries((msg.data.payload?.headers ?? []).map((x) => [x.name, x.value]));
    const unread = msg.data.labelIds?.includes("UNREAD") ? "UNREAD" : "read";
    console.log(
      `- [${unread}] ${h["Date"]}\n    From: ${h["From"]}\n    To: ${h["To"]}\n    Delivered-To: ${h["Delivered-To"] ?? "(none)"}\n    Subject: ${h["Subject"]}`
    );
  }

  console.log(`\n--- Messages matching deliveredto:${GMAIL_HUB_EMAIL} (any read state, 14d) ---`);
  const filtered = await gmail.users.messages.list({ userId: "me", q: `deliveredto:${GMAIL_HUB_EMAIL} newer_than:14d` });
  console.log(`${filtered.data.messages?.length ?? 0} matched.`);

  console.log(`\n--- Old (broken) query: in:inbox is:unread -from:me deliveredto:${GMAIL_HUB_EMAIL} ---`);
  const pollerQuery = await gmail.users.messages.list({ userId: "me", q: `in:inbox is:unread -from:me deliveredto:${GMAIL_HUB_EMAIL}` });
  console.log(`${pollerQuery.data.messages?.length ?? 0} matched.`);

  console.log(`\n--- Candidate fix: in:inbox is:unread -from:me {to:${GMAIL_HUB_EMAIL} cc:${GMAIL_HUB_EMAIL}} ---`);
  const fixed = await gmail.users.messages.list({
    userId: "me",
    q: `in:inbox is:unread -from:me {to:${GMAIL_HUB_EMAIL} cc:${GMAIL_HUB_EMAIL}}`,
  });
  console.log(`${fixed.data.messages?.length ?? 0} matched.`);

  console.log(`\n--- Same fix, without is:unread (to see all-time group mail in this inbox) ---`);
  const fixedAll = await gmail.users.messages.list({
    userId: "me",
    q: `in:inbox -from:me {to:${GMAIL_HUB_EMAIL} cc:${GMAIL_HUB_EMAIL}}`,
  });
  console.log(`${fixedAll.data.messages?.length ?? 0} matched.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
