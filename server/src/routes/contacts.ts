// GET /api/contacts — the list of email addresses the Hub has seen, so the
// reply box can autocomplete Cc recipients. Sourced from Hub users plus
// everyone who has ever been on an inbound email's To/Cc or been a
// requester. Any logged-in Member/Admin can read it (Plant Staff don't use
// the Hub UI).
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Splits a raw "a@x.com, b@y.com" header value into lowercased addresses. */
function parseAddresses(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_RE.test(e));
}

router.get("/", requireAuth, async (req, res) => {
  if (req.user!.role === "PLANT_STAFF") {
    return res.status(403).json({ error: "Not available" });
  }

  const hubEmail = (process.env.GMAIL_HUB_EMAIL || "").toLowerCase();

  const [users, requests] = await Promise.all([
    prisma.user.findMany({ select: { name: true, email: true } }),
    prisma.serviceRequest.findMany({
      select: {
        originalToRaw: true,
        originalCcRaw: true,
        requester: { select: { name: true, email: true } },
      },
    }),
  ]);

  // email -> best display name we have for it ("" when we only know the address)
  const byEmail = new Map<string, string>();
  const add = (email: string | null | undefined, name?: string | null) => {
    if (!email) return;
    const e = email.toLowerCase();
    if (!EMAIL_RE.test(e) || e === hubEmail) return;
    const cleanName = name?.trim() && name.trim().toLowerCase() !== e ? name.trim() : "";
    if (!byEmail.has(e) || (cleanName && !byEmail.get(e))) byEmail.set(e, cleanName);
  };

  for (const u of users) add(u.email, u.name);
  for (const r of requests) {
    add(r.requester?.email, r.requester?.name);
    for (const e of parseAddresses(r.originalToRaw)) add(e);
    for (const e of parseAddresses(r.originalCcRaw)) add(e);
  }

  const contacts = [...byEmail.entries()]
    .map(([email, name]) => ({ email, name }))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

  res.json(contacts);
});

export default router;
