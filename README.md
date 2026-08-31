# RDC Hub

Logistics Service Request platform. Plant staff raise requests by emailing
one shared inbox; RDC Hub reads that inbox, auto-routes the message to a
query type by keyword match, and assigns it to a team member with rights
to that query type. Members work the request through to resolution inside
the Hub; every reply they post is emailed back to the plant staff member,
and any further email reply from them is appended to the same ticket.
Resolved answers can be promoted into a searchable Common Questions (FAQ)
tab.

## Stack

- **Backend**: Node.js + TypeScript + Express, Prisma ORM, SQLite (dev)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Auth**: local username/password (JWT in an httpOnly cookie), for Admin
  and Member accounts only — see [Moving to company AD / SSO](#moving-to-company-ad--sso)
  below. Plant Staff don't log in at all; see [Email intake (Gmail)](#email-intake-gmail).
- **Email intake**: Gmail API (free), polling a dedicated shared mailbox —
  see [Email intake (Gmail)](#email-intake-gmail) below.

## Prerequisites

- Node.js 20+ and npm

## Setup (local)

```bash
npm run setup      # installs dependencies, runs the DB migration, and seeds sample data
npm run dev         # starts the API (port 4000) and the Vite dev server (port 5173)
```

Open http://localhost:5173. Seeded logins (password for both: `ChangeMe123!`):

| Role         | Username  |
|--------------|-----------|
| Admin        | `admin`   |
| Member       | `member1` |

(Plant Staff don't log in — see [Email intake (Gmail)](#email-intake-gmail).
The seed also creates a sample Plant Staff directory record, `staff1`, with
no password.)

**Change these passwords (or replace the seed users) before this is exposed to real users.**

## Running it "production style" locally

```bash
npm run build       # builds the client and compiles the server
npm start           # serves everything from one Node process on PORT (default 4000)
```

Open http://localhost:4000 — this is the same way it will run on the company server.

## Running behind RDC Nexus

RDC Hub can also be reached at `/hub/` through the single-port launcher in
[`../RDC Nexus`](../RDC%20Nexus/README.md), alongside RDC Connect, the training
tool, and RDC One. Build the client with RDC Nexus's base path first:

```bash
VITE_BASE=/hub/ npm run build -w client
npm run build -w server
```

then run it via `npm run start-all` in `../RDC Nexus` (or `npm start` here if
you're starting it separately). Standalone dev/build (`npm run dev`,
`npm run build` without `VITE_BASE`) is unaffected.

## Project layout

```
server/   Express API + Prisma schema (server/prisma/schema.prisma)
client/   React app (client/src)
```

## Branding

The header (`client/src/components/Layout.tsx`) and the login page
(`client/src/pages/Login.tsx`) show "RDC Concrete India Ltd." with a truck
graphic top-left and "RDC Hub" centered, in Inter (a self-hosted font via
`@fontsource/inter` — no CDN dependency, works on an offline LAN). The
truck image itself isn't part of the repo — drop the file at
**`client/public/rdc-truck.png`** (any reasonable size; it's rendered at a
fixed height) and it'll appear automatically, no rebuild needed in dev
(`npm run dev`); for the production build, it just needs to exist there
before running `npm run build`. Until that file exists, the header/login
simply omit the image rather than showing a broken-image icon.

Plant Staff never log into the Hub — they interact entirely by email (see
below). Everyone who does log in sees a role-specific dashboard:
- **Member**: My Queue (requests assigned to them), Common Questions.
- **Admin**: Overview, All Requests, Users, Query Types, Assignments
  (member ↔ query-type rights matrix), Plants, Common Questions.

## Moving to the company server

1. **Database**: swap SQLite for SQL Server or Postgres — change the
   `provider` in `server/prisma/schema.prisma` and set `DATABASE_URL` in
   `server/.env` accordingly, then re-run the migration.
2. **Secrets**: set a strong, random `JWT_SECRET` in `server/.env`.
3. **Auth**: local login lives entirely in `server/src/lib/auth.ts` and
   the `/login` handler in `server/src/routes/auth.ts`. See the comment
   at the bottom of `auth.ts` for how to swap in company AD (LDAP bind)
   or Azure AD/Entra SSO (OIDC) without touching the rest of the app.
4. **Process**: `npm run build && npm start` runs the whole app as one
   Node process on `PORT`. On Windows Server this can run as a Windows
   Service (e.g. via NSSM or `node-windows`) with IIS as a reverse proxy
   in front of it for SSL/hostname routing — or hosted directly on a
   cloud VM/App Service if you go that route instead.
5. **File uploads**: stored on local disk under `server/uploads/` by
   default. If you run more than one server instance, set `UPLOAD_DIR` in
   `server/.env` to a shared/network path — no code change needed.
6. **Email intake**: see [Email intake (Gmail)](#email-intake-gmail) below
   — it needs its own one-time Google Cloud OAuth setup independent of the
   rest of deployment.

## Hosting as a standalone public site

RDC Hub is self-contained — it does not depend on RDC Nexus. To deploy it
on its own domain:

1. **Build standalone** (base path `/`, not `/hub/`):
   ```bash
   npm ci
   npm run build          # client (base "/") + server
   ```
   Do **not** set `VITE_BASE` — that flag is only for the RDC Nexus mount.
   The compiled output is `client/dist/` (static) and `server/dist/`; the
   server serves the client itself, so `npm start` is the only process.
2. **Env** (`server/.env`): `NODE_ENV=production` (makes the auth cookie
   `Secure`), a strong random `JWT_SECRET`, `PORT`, `DATABASE_URL`, and the
   `GMAIL_*` values. `CLIENT_ORIGIN` is not needed in production (same
   origin). Never commit `.env` — it's gitignored; keep a copy in the
   host's secret store.
3. **HTTPS**: terminate TLS at a reverse proxy (nginx / Caddy / IIS / a
   cloud load balancer) in front of `npm start`. The app assumes it's
   reached over HTTPS in production (cookie flags).
4. **Database**: SQLite is fine for a single instance; for anything
   bigger switch `provider` + `DATABASE_URL` (step 1 of the previous
   section) and run `npx prisma migrate deploy`.
5. **Uploads**: `server/uploads/` on local disk — put it on a persistent
   volume, or shared storage if you run more than one instance.
6. **Migrate the folder directly**: copying the whole `RDC Hub/` folder to
   a host works as-is (it's a standard npm workspace). `node_modules/`,
   `dist/`, and `server/prisma/dev.db` are gitignored, so after copying a
   *clone* run `npm ci && npm run build && npx prisma migrate deploy -w server`.

## Email intake (Gmail)

Plant staff raise and follow up on requests entirely by emailing one
dedicated Gmail mailbox (e.g. `rdchub.support@gmail.com`). RDC Hub polls
that inbox (`server/src/lib/emailPoller.ts`, every `EMAIL_POLL_INTERVAL_MS`
— default 2 minutes) via the free Gmail API, routes new mail to a Query
Type by keyword match (`server/src/lib/emailRouter.ts`), creates a ticket
assigned the same way a web-created one would be, and saves any
attachments. When a Member/Admin replies from inside the Hub, it's emailed
back to the sender (`server/src/lib/gmail.ts`'s `sendReply`), threaded
under the original conversation; a further reply from the sender is
appended to the same ticket as a new comment.

There are two ways to authorize the hub mailbox — pick one:

### Option A: Workspace service account (recommended for `distribution@rdc.in`)

Since `distribution@rdc.in` lives on the company's Google Workspace
domain, this is the better option: **replies send as `distribution@rdc.in`
itself** (no "send as" alias needed), and there's **no refresh token to
expire** — nothing to re-run every ~7 days. It needs a one-time setup by
whoever has Google Workspace Admin access for `rdc.in`, plus Cloud Console
access (both can be the same person as the OAuth option below):

1. In [console.cloud.google.com](https://console.cloud.google.com), create
   (or reuse) a project, then **APIs & Services > Library**: enable the
   **Gmail API**.
2. **IAM & Admin > Service Accounts > Create Service Account** — any name
   (e.g. "rdc-hub-gmail"). No roles needed on the account itself.
3. Open the new service account > **Keys > Add Key > Create new key >
   JSON**. This downloads a `.json` key file — save it as
   `server/gmail-service-account.json` (already gitignored — never commit
   it). Note the service account's **Client ID** (a long number, on the
   service account's Details tab), needed for the next step.
4. In the [Google Workspace Admin console](https://admin.google.com)
   (needs a Workspace super admin for `rdc.in`): **Security > Access and
   data control > API controls > Domain-wide delegation > Add new**.
     - **Client ID**: the service account's Client ID from step 3.
     - **OAuth scopes**: `https://mail.google.com/`
     - Authorize.
5. In `server/.env`, set:
   ```
   GMAIL_SERVICE_ACCOUNT_KEY_PATH=./gmail-service-account.json
   GMAIL_HUB_EMAIL=distribution@rdc.in
   ```
   (Leave `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`/`GMAIL_REFRESH_TOKEN`
   blank — they're not used when a service account key is set.)
6. Restart the server. Startup logs confirm whether email intake is
   enabled; Admin > Overview also shows live poll status. `npm run
   gmail:diag` (from `server/`) works with this setup too, for
   troubleshooting.

### Option B: personal OAuth account

Simpler to set up, but the mailbox must be a personal-style Gmail account
you can sign into interactively, replies send from whichever account signs
in (with that account's name, unless it has a verified "send as" alias for
the hub address), and the refresh token needs periodic renewal:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create a new project.
2. **APIs & Services > Library**: enable the **Gmail API**.
3. **APIs & Services > OAuth consent screen**: choose External, fill in
   the required fields, leave it in **Testing** status, and add the hub
   Gmail account (and yours, if different) as a **test user**.
4. **APIs & Services > Credentials > Create Credentials > OAuth client
   ID**, application type **Desktop app**. Copy the Client ID and Client
   Secret into `server/.env` as `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`.
5. Set `GMAIL_HUB_EMAIL` in `server/.env` to the mailbox address.
6. From `server/`, run `npm run gmail:auth`. It prints a Google sign-in
   URL — open it, sign in as the **hub account**, and approve access. The
   script prints a `GMAIL_REFRESH_TOKEN` — paste that into `server/.env`
   too.
7. Restart the server. Startup logs confirm whether email intake is
   enabled; Admin > Overview also shows live poll status.

**A caveat worth knowing:** because the OAuth consent screen stays in
"Testing" status (skipping Google's app-verification review, which is
heavy for a small internal tool), Google may expire the refresh token
after a period of inactivity or after ~7 days for unverified apps. If
email intake stops working, re-run `npm run gmail:auth` to mint a fresh
token — it takes about two minutes. The server logs loudly (and Admin >
Overview shows it) when auth fails, so this isn't a silent failure. This
is exactly what Option A avoids.

Routing is controlled from **Admin > Query Types**: give each query type
comma-separated keywords, and mark exactly one as the "email default" —
the catch-all for messages that match no keywords. Senders don't need to
be pre-registered; anyone who emails the hub gets a ticket, and a directory
record is created for them automatically if they're new (see **Admin quick
start** below for pre-registering known plant staff to get correct Plant
matching from their very first email).

## Admin quick start

1. Log in as `admin`.
2. **Plants**: add/rename your actual plant list (seeded with placeholders).
3. **Query Types**: add/edit the categories requests get routed to, and set
   keywords + one "email default" on each — see
   [Email intake (Gmail)](#email-intake-gmail).
4. **Users**: create accounts for your team (role = Member). Optionally
   pre-register known plant staff (role = Plant Staff) with their email and
   home plant so their tickets are matched to the right plant from their
   first email — otherwise one is created automatically the first time they
   write in.
5. **Assignments**: check the boxes to give each Member rights to the
   query types they should handle. New requests auto-route to whichever
   assigned member currently has the fewest open requests.

## Bulk upload (Plants, Users, Common Questions)

Every admin list page (Plants, Users) and the Common Questions tab has a
**Bulk upload** panel: download the CSV template for the exact column
headers expected, fill it in from Excel, and upload it. Each row is
reported back as `created`, `skipped` (already exists — safe to
re-upload the same file twice), or `error` (with a reason).

- **Plants**: `name`, `code`
- **Users**: `name`, `email`, `username`, `role` (`ADMIN`/`MEMBER`/`PLANT_STAFF`),
  `plantcode` (optional, must match an existing plant's code)
- **Common Questions**: `question`, `answer`, `querytype` (optional,
  matched by name)

**Bulk-created Admin/Member users get no password.** Instead each gets a
one-time 6-digit OTP, which is both shown once in the upload results table
(copyable, in case email intake isn't configured or the send fails) and,
if [Email intake (Gmail)](#email-intake-gmail) is set up, emailed straight
to the person via `sendMail` in `server/src/lib/gmail.ts`. The user visits
**Activate Account** (linked from the login page), enters their username +
OTP, and sets their own password. OTPs are valid for 7 days; if one
expires or is lost, use **Resend OTP** / **Reset via OTP** next to that
user on the Users page to generate (and re-email) a fresh one. This same
flow also works as an admin-driven password reset for any existing user.
**Plant Staff rows get no OTP either** — they're directory-only records
(no login at all).

## Routing unmatched email & teaching keywords

If an inbound email matches no `QueryType` keyword, it's **not**
auto-assigned to a single person — it's created unassigned and shows up
for every Member (in My Queue's "Unclaimed" section, and in the request
list generally), tagged "Unclaimed — visible to all members" on the detail
page. Any Member can:
- **Claim it** (or assign it to a colleague) from the Claim/Assign panel
  on the request detail page — `PATCH /api/requests/:id` permits this
  specifically for currently-unassigned requests (`server/src/routes/requests.ts`).
- **Teach the router** from the amber "Teach Routing" panel that appears
  on any such ticket: pick (or keep) a Query Type, add keyword(s), and
  optionally name a responsible person. This appends the keyword(s) to
  that Query Type (`POST /api/query-types/:id/learn`) and, if a person was
  picked, grants them routing rights to it (same mechanism as the
  Assignments admin page) — so matching emails from then on auto-assign
  correctly. This endpoint is intentionally open to any Member, not just
  Admin.

## Email replies: numbering, quoting, and Cc

- **Ticket numbers** are short and sequential — `SR-1`, `SR-2`, `SR-3`, …
  (`server/src/lib/ticketNumber.ts`) — no zero-padding.
- **Outbound reply subject** is `[SR-<n>] Re: <original subject>` — the
  bracketed ticket number is also how a reply is matched back to its
  ticket if a mail client ever breaks Gmail's native thread tracking (see
  `TICKET_TAG_RE` in `server/src/lib/emailPoller.ts`).
- **The original email stays quoted below your reply** (`On <date>, <name>
  <email> wrote: > ...`), same as a normal mail-client reply.
- **Cc** automatically carries forward everyone who was on the original
  inbound email's To/Cc (minus the hub address and the primary recipient,
  who's already the "To"). The reply box on the request detail page also
  has an "Add more Cc recipients" field for looping in anyone new, per
  reply.
- **Formatting**: outbound replies are sent as text + HTML
  (`server/src/lib/emailFormat.ts`'s `buildReplyHtml`) so they render as
  real paragraphs with a proper indented quote block in HTML-preferring
  clients (Outlook, Gmail) instead of raw `> `-prefixed plain text.
  Inbound mail is run through `cleanInboundText` before being stored: it
  strips the quoted thread history a reply typically carries below it
  ("On ... wrote:", "-----Original Message-----", a `>`-quoted block, …
  — the Hub already keeps that history as separate comments) and rejoins
  lines that a sender's mail client hard-wrapped mid-sentence (common
  with classic Outlook, which wraps plain text at ~76 columns without
  marking it `format=flowed`), which otherwise shows up as a ragged,
  broken-looking paragraph.

## Attachments

Both directions support attachments of any type — Excel, PDF, images,
Word docs, etc. — up to 15MB per file, 5 files per message:

- **Inbound**: any files on an inbound email are saved and attached to
  the ticket (or the comment, if it's a reply on an existing thread) the
  same way a web upload is (`server/src/lib/emailPoller.ts`'s
  `saveAttachments`).
- **Outbound**: the reply box on the request detail page has an "Attach
  files" picker. Files picked there are saved against the reply *and*,
  for an email-originated ticket, sent as real email attachments on the
  outbound reply (`server/src/routes/requests.ts`) — reusing the same
  file already written to `server/uploads/`, no re-upload. If a reply's
  attachments would push the message over Gmail's 25MB total size cap
  (kept under a 20MB internal threshold), they're skipped from the
  *email* but still saved and downloadable in the Hub, with a note added
  to the email body pointing back to the Hub.
