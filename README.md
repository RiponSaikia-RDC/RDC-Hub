# RDC Hub

Logistics Service Request platform for plant staff. Plant staff submit a
service request (subject, body, query type); it auto-routes to a team
member with rights to that query type; members work the request through
to resolution; resolved answers can be promoted into a searchable Common
Questions (FAQ) tab.

## Stack

- **Backend**: Node.js + TypeScript + Express, Prisma ORM, SQLite (dev)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Auth**: local username/password (JWT in an httpOnly cookie) — see
  [Moving to company AD / SSO](#moving-to-company-ad--sso) below.

## Prerequisites

- Node.js 20+ and npm

## Setup (local)

```bash
npm run setup      # installs dependencies, runs the DB migration, and seeds sample data
npm run dev         # starts the API (port 4000) and the Vite dev server (port 5173)
```

Open http://localhost:5173. Seeded logins (password for all: `ChangeMe123!`):

| Role         | Username  |
|--------------|-----------|
| Admin        | `admin`   |
| Member       | `member1` |
| Plant Staff  | `staff1`  |

**Change these passwords (or replace the seed users) before this is exposed to real users.**

## Running it "production style" locally

```bash
npm run build       # builds the client and compiles the server
npm start           # serves everything from one Node process on PORT (default 4000)
```

Open http://localhost:4000 — this is the same way it will run on the company server.

## Project layout

```
server/   Express API + Prisma schema (server/prisma/schema.prisma)
client/   React app (client/src)
```

Each role sees a different dashboard:
- **Plant Staff**: New Request form (with live "did you mean this?" FAQ
  suggestions), My Requests, Common Questions.
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
5. **File uploads**: currently stored on local disk under
   `server/uploads/`. If you run more than one server instance, point
   this at shared/network storage.
6. **Email notifications**: not built yet (in-app only for now). Adding
   them later means wiring an SMTP client into the request/comment
   creation routes in `server/src/routes/requests.ts`.

## Admin quick start

1. Log in as `admin`.
2. **Plants**: add/rename your actual plant list (seeded with placeholders).
3. **Query Types**: add/edit the categories staff will choose from.
4. **Users**: create accounts for your team (role = Member) and for plant
   staff (role = Plant Staff), assigning each a home plant.
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

**Bulk-created users get no password.** Instead each gets a one-time
6-digit OTP, shown once in the upload results table (and copyable) for
the admin to relay to that person — nothing is emailed automatically
since there's no SMTP configured yet (see below). The user visits
**Activate Account** (linked from the login page), enters their
username + OTP, and sets their own password. OTPs are valid for 7 days;
if one expires or is lost, use **Resend OTP** / **Reset via OTP** next
to that user on the Users page to generate a fresh one. This same flow
also works as an admin-driven password reset for any existing user.

When you're ready to add SMTP, the OTP is already generated and
returned from the same `/api/users/bulk` and `/api/users/:id/regenerate-otp`
endpoints (`server/src/routes/users.ts`) — wire an email send there
instead of (or in addition to) returning it to the admin, no other
rework needed.
