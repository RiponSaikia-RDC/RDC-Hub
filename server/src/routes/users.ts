import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { bulkSummary, csvUpload, MAX_BULK_ROWS, parseCsv, type BulkResultRow } from "../lib/csv";
import { generateOtp, otpExpiry } from "../lib/otp";
import { sendMail } from "../lib/gmail";

// OTP is still always returned in the API response / shown in the admin UI
// too (see CsvUploader / the otpBanner in Users.tsx) — email delivery is a
// convenience on top, not the only way to get it, in case Gmail intake
// isn't configured or the send fails.
async function emailOtp(to: string, name: string, username: string, otp: string) {
  try {
    await sendMail({
      to,
      subject: "Your RDC Hub account — activation code",
      text:
        `Hi ${name},\n\n` +
        `An RDC Hub account was created for you.\n\n` +
        `Username: ${username}\n` +
        `One-time code: ${otp}\n\n` +
        `Go to the RDC Hub login page, click "Activate Account", and enter your username and this code to set your own password. This code is valid for 7 days.\n`,
    });
  } catch (err) {
    console.error(`[users] Could not email OTP to ${to}:`, err);
  }
}

const router = Router();

const userSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  role: true,
  active: true,
  activated: true,
  plantId: true,
  createdAt: true,
  plant: true,
  // Safe to expose — the actual token (gmailRefreshTokenEnc) never is.
  gmailConnectedEmail: true,
  gmailConnectedAt: true,
} as const;

// Admin: full user list. Everyone else: a lightweight list of members
// (id/name only) so e.g. reassignment UIs can work without exposing PII.
router.get("/", requireAuth, async (req, res) => {
  if (req.user!.role === "ADMIN") {
    const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: userSelect });
    return res.json(users);
  }
  const members = await prisma.user.findMany({
    where: { role: "MEMBER", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(members);
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  username: z.string().min(3),
  // Not required for PLANT_STAFF — that role never logs in to the Hub
  // (interacts by email only, see server/src/lib/emailPoller.ts), so these
  // are directory records rather than login accounts.
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "MEMBER", "PLANT_STAFF"]),
  plantId: z.number().int().optional().nullable(),
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid data" });

  const { password, ...rest } = parsed.data;
  if (rest.role !== "PLANT_STAFF" && !password) {
    return res.status(400).json({ error: "Password is required for Admin/Member accounts" });
  }

  try {
    const user = await prisma.user.create({
      data: {
        ...rest,
        passwordHash: password ? await hashPassword(password) : null,
        // Nothing to activate for Plant Staff (no login, no OTP flow).
        activated: true,
      },
      select: userSelect,
    });
    res.status(201).json(user);
  } catch {
    res.status(409).json({ error: "A user with that email or username already exists" });
  }
});

const ROLE_VALUES = ["ADMIN", "MEMBER", "PLANT_STAFF"] as const;

// Bulk import via CSV. Expected headers: name, email, username, role, plantcode (optional).
// Bulk-imported users get NO password — they activate their own account with
// a one-time OTP (returned here for the admin to relay) on the Activate
// Account page. See server/src/routes/auth.ts's /activate handler.
router.post("/bulk", requireAuth, requireRole("ADMIN"), csvUpload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  let rows: Record<string, string>[];
  try {
    rows = parseCsv(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not parse that CSV file" });
  }
  if (rows.length === 0) return res.status(400).json({ error: "The file has no rows" });
  if (rows.length > MAX_BULK_ROWS) {
    return res.status(400).json({ error: `Please upload at most ${MAX_BULK_ROWS} rows at a time` });
  }

  const [existingUsers, plants] = await Promise.all([
    prisma.user.findMany({ select: { email: true, username: true } }),
    prisma.plant.findMany({ select: { id: true, code: true } }),
  ]);
  const seenEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));
  const seenUsernames = new Set(existingUsers.map((u) => u.username.toLowerCase()));
  const plantByCode = new Map(plants.map((p) => [p.code.toLowerCase(), p.id]));

  const results: BulkResultRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];
    const name = row.name?.trim();
    const email = row.email?.trim();
    const username = row.username?.trim();
    const roleRaw = row.role?.trim().toUpperCase().replace(/\s+/g, "_");
    const plantCode = row.plantcode?.trim();

    const base = { row: rowNum, name, email, username };

    if (!name || !email || !username) {
      results.push({ ...base, status: "error", message: "name, email, and username are all required" });
      continue;
    }
    if (!roleRaw || !ROLE_VALUES.includes(roleRaw as any)) {
      results.push({ ...base, status: "error", message: `role must be one of ${ROLE_VALUES.join(", ")}` });
      continue;
    }
    let plantId: number | null = null;
    if (plantCode) {
      const found = plantByCode.get(plantCode.toLowerCase());
      if (!found) {
        results.push({ ...base, status: "error", message: `unknown plant code "${plantCode}"` });
        continue;
      }
      plantId = found;
    }
    if (seenEmails.has(email.toLowerCase()) || seenUsernames.has(username.toLowerCase())) {
      results.push({ ...base, status: "skipped", message: "already exists" });
      continue;
    }

    // Plant Staff never log in (email is their channel — see
    // server/src/lib/emailPoller.ts), so they skip the OTP dance entirely
    // and are directory records from the moment they're created.
    const isPlantStaff = roleRaw === "PLANT_STAFF";
    const otp = isPlantStaff ? null : generateOtp();
    try {
      await prisma.user.create({
        data: {
          name,
          email,
          username,
          role: roleRaw,
          plantId,
          passwordHash: null,
          activated: isPlantStaff,
          otpCode: otp ? await hashPassword(otp) : null,
          otpExpiresAt: otp ? otpExpiry() : null,
        },
      });
      seenEmails.add(email.toLowerCase());
      seenUsernames.add(username.toLowerCase());
      if (otp) await emailOtp(email, name, username, otp);
      results.push({ ...base, status: "created", role: roleRaw, otp: otp ?? undefined });
    } catch {
      results.push({ ...base, status: "error", message: "could not create this row" });
    }
  }

  res.json({ summary: bulkSummary(results), results });
});

// Admin remediation: (re)generates an OTP for a user, clearing any existing
// password, so they can activate/reactivate via the Activate Account page.
// Doubles as an admin-driven "forgot password" reset.
router.post("/:id/regenerate-otp", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const otp = generateOtp();
  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        passwordHash: null,
        activated: false,
        otpCode: await hashPassword(otp),
        otpExpiresAt: otpExpiry(),
      },
      select: userSelect,
    });
    await emailOtp(user.email, user.name, user.username, otp);
    res.json({ user, otp });
  } catch {
    res.status(404).json({ error: "User not found" });
  }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "MEMBER", "PLANT_STAFF"]).optional(),
  plantId: z.number().int().optional().nullable(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid data" });

  const { password, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (password) {
    data.passwordHash = await hashPassword(password);
    data.activated = true;
    data.otpCode = null;
    data.otpExpiresAt = null;
  }

  try {
    const user = await prisma.user.update({ where: { id }, data, select: userSelect });
    res.json(user);
  } catch {
    res.status(404).json({ error: "User not found" });
  }
});

// Hard delete — only for users with no activity on record (e.g. a mistyped
// entry or a seeded placeholder). Anyone who has raised, been assigned, or
// commented on a request must be disabled instead, so their history stays
// intact. QueryTypeAssignment rows cascade on delete.
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    return res.status(400).json({ error: "You can't delete your own account" });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const [submitted, assigned, comments, attachments, faqEntries] = await Promise.all([
    prisma.serviceRequest.count({ where: { requesterId: id } }),
    prisma.serviceRequest.count({ where: { assignedToId: id } }),
    prisma.comment.count({ where: { authorId: id } }),
    prisma.attachment.count({ where: { uploadedById: id } }),
    prisma.faqEntry.count({ where: { createdById: id } }),
  ]);
  if (submitted + assigned + comments + attachments + faqEntries > 0) {
    return res.status(409).json({
      error:
        `This user has activity on ${submitted + assigned} request(s) and ${comments} reply(ies). ` +
        `Disable the account instead of deleting it.`,
    });
  }

  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
