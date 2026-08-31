// One-time per-person Gmail connect: run by an admin, with the teammate
// present to sign into their own Google account when the browser window
// opens. Mints a personal refresh token, encrypts it, and stores it on
// that Hub user's row so their replies in the Hub go out as themselves
// from then on. See README.md's "Email intake (Gmail)" > "Replies send as
// the logged-in member" section.
//
// Scope: reuses the same "https://mail.google.com/" full-access scope
// gmailAuth.ts already requests (rather than the narrower gmail.send-only
// scope this actually needs), because that's the scope already approved
// on the OAuth consent screen's Data Access config — requesting a scope
// that isn't listed there can fail even in Testing mode for a sensitive
// API like Gmail's. If you'd rather each person's own connection only
// ever be *able* to send (not read) their mail, add
// "https://www.googleapis.com/auth/gmail.send" under the consent screen's
// Data Access tab first, then narrow the scope below to just that.
//
// Usage (from server/): npm run gmail:connect -- <hub-username>
//   npm run gmail:connect -- ripon.saikia
//
// Uses the same OAuth2 "Desktop app" loopback flow as gmailAuth.ts — works
// on any machine with no domain/HTTPS needed, but must be run on the same
// machine as the browser that signs in (i.e. run this locally, not over a
// remote shell on the server, unless that IS the machine you're browsing
// from).
import "dotenv/config";
import http from "http";
import { URL } from "url";
import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";
import { encryptSecret } from "../lib/tokenCrypto";

const PORT = 53683; // different from gmailAuth.ts's 53682, so both can be run independently
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];
  const force = process.argv.includes("--force");
  if (!username) {
    console.error("Usage: npm run gmail:connect -- <hub-username> [--force]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`No Hub user with username "${username}".`);
    process.exit(1);
  }
  if (!user.email) {
    console.error(`User "${username}" has no email set in the Hub — set one first (Admin > Users).`);
    process.exit(1);
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in server/.env first (see README's Email intake section).");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces a refresh_token back even on a repeat connect
    scope: ["https://mail.google.com/"],
    login_hint: user.email,
  });

  console.log(`\nConnecting Gmail for Hub user "${user.name}" (${user.email}).`);
  console.log("\n1. Have THEM open this URL and sign in as THEIR OWN rdc.in Google account:\n");
  console.log(authUrl);
  console.log(`\n2. They approve access. This waits for the redirect back to localhost:${PORT}.\n`);

  const code = await waitForCode();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh_token came back — this account already granted access before without consent being " +
        "forced. Go to https://myaccount.google.com/permissions, remove access for this app, and re-run this."
    );
    process.exit(1);
  }

  // Confirm which account actually authorized this, and that it matches
  // the email on file for this Hub user — sending as the wrong mailbox
  // would be a real problem, not just a cosmetic one.
  oauth2Client.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const connectedEmail = (profile.data.emailAddress || "").toLowerCase();

  if (connectedEmail !== user.email.toLowerCase() && !force) {
    console.error(
      `\nSigned in as ${connectedEmail}, but this Hub user's email is ${user.email} — refusing to save a ` +
        `mismatched connection (their replies would send as the wrong person). Either sign in as the correct ` +
        `account and re-run this, fix the email on their Hub account first, or re-run with --force if this ` +
        `mismatch is actually intended.`
    );
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      gmailRefreshTokenEnc: encryptSecret(tokens.refresh_token),
      gmailConnectedEmail: connectedEmail,
      gmailConnectedAt: new Date(),
    },
  });

  console.log(`\nConnected. Replies "${user.name}" sends in the Hub will now go out as ${connectedEmail}.`);
}

function waitForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(error ? `<p>Authorization failed: ${error}. You can close this tab.</p>` : "<p>Connected — you can close this tab and return to the terminal.</p>");
      server.close();
      if (error) reject(new Error(error));
      else if (code) resolve(code);
      else reject(new Error("No code or error returned"));
    });
    server.listen(PORT);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
