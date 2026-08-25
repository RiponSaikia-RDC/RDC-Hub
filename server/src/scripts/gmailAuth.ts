// One-time interactive script to mint a Gmail API refresh token for the
// hub mailbox. Run with `npm run gmail:auth` (from server/). See
// README.md's "Email intake (Gmail)" section for the full walkthrough
// (Google Cloud project, OAuth consent screen, Client ID).
//
// Uses the OAuth2 "Desktop app" / loopback flow: no public URL needed,
// just a temporary local HTTP server to catch the redirect.
import "dotenv/config";
import http from "http";
import { URL } from "url";
import { google } from "googleapis";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in server/.env first (from your Google Cloud OAuth Client ID), then re-run this.");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    // Forces Google to hand back a refresh token even if this account has
    // authorized this app before (otherwise a repeat auth can silently
    // omit it).
    prompt: "consent",
    scope: ["https://mail.google.com/"],
  });

  console.log("\n1. Open this URL and sign in as the HUB Gmail account (not your personal one):\n");
  console.log(authUrl);
  console.log(`\n2. Approve access. You'll be redirected to localhost:${PORT} — this script is waiting for that.\n`);

  const code = await waitForCode();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh_token came back. This usually means the account already granted access before " +
        "without consent being forced. Go to https://myaccount.google.com/permissions, remove access " +
        "for this app, and re-run this script."
    );
    process.exit(1);
  }

  console.log("\nSuccess! Add this to server/.env:\n");
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("\n(If this ever stops working — Google can expire refresh tokens for unverified apps after a\nperiod of inactivity — just re-run this script to mint a fresh one.)\n");
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
      res.end(error ? `<p>Authorization failed: ${error}. You can close this tab.</p>` : "<p>Authorized — you can close this tab and return to the terminal.</p>");
      server.close();
      if (error) reject(new Error(error));
      else if (code) resolve(code);
      else reject(new Error("No code or error returned"));
    });
    server.listen(PORT);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
