import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/requireAuth";

const router = Router();

// Anyone logged in can list active query types (needed for New Request dropdown).
// Admins can pass ?all=1 to include inactive ones for management screens.
router.get("/", requireAuth, async (req, res) => {
  const includeInactive = req.query.all === "1" && req.user!.role === "ADMIN";
  const queryTypes = await prisma.queryType.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  res.json(queryTypes);
});

const qtSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  active: z.boolean().optional(),
  keywords: z.string().optional().nullable(),
  isEmailDefault: z.boolean().optional(),
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = qtSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Name is required" });
  try {
    const qt = await prisma.queryType.create({ data: parsed.data });
    res.status(201).json(qt);
  } catch {
    res.status(409).json({ error: "A query type with that name already exists" });
  }
});

router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = qtSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data" });
  try {
    // At most one QueryType may be the email-routing fallback — setting
    // this one clears the flag on every other row first.
    if (parsed.data.isEmailDefault) {
      const qt = await prisma.$transaction(async (tx) => {
        await tx.queryType.updateMany({ where: { isEmailDefault: true, id: { not: id } }, data: { isEmailDefault: false } });
        return tx.queryType.update({ where: { id }, data: parsed.data });
      });
      return res.json(qt);
    }
    const qt = await prisma.queryType.update({ where: { id }, data: parsed.data });
    res.json(qt);
  } catch {
    res.status(404).json({ error: "Query type not found" });
  }
});

const learnSchema = z.object({
  // Comma-separated keyword(s) to add — merged into the existing list
  // (case-insensitive de-duped), never replacing what's already there.
  keywords: z.string().min(1),
  // Optional: give this member routing rights to the query type too, so
  // future keyword matches auto-assign to them (same mechanism as the
  // Assignments admin page — see assignmentPicker.ts).
  assigneeId: z.number().int().optional(),
});

// Any logged-in Member/Admin can teach the router a keyword mapping —
// intentionally not admin-only. This is how a no-keyword-match email
// ticket (see emailPoller.ts / requests.ts's broadcast-to-all-members
// behavior) gets taught for next time, right from the request detail page.
router.post("/:id/learn", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = learnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid data" });

  const qt = await prisma.queryType.findUnique({ where: { id } });
  if (!qt) return res.status(404).json({ error: "Query type not found" });

  const existing = (qt.keywords ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const incoming = parsed.data.keywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const merged = Array.from(new Set([...existing, ...incoming]));

  const updated = await prisma.$transaction(async (tx) => {
    const qtUpdated = await tx.queryType.update({ where: { id }, data: { keywords: merged.join(", ") } });
    if (parsed.data.assigneeId) {
      await tx.queryTypeAssignment.upsert({
        where: { userId_queryTypeId: { userId: parsed.data.assigneeId, queryTypeId: id } },
        update: {},
        create: { userId: parsed.data.assigneeId, queryTypeId: id },
      });
    }
    return qtUpdated;
  });

  res.json(updated);
});

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  try {
    // Soft-delete by deactivating instead of hard delete, since existing
    // SRs / FAQ entries likely reference this query type.
    const qt = await prisma.queryType.update({ where: { id }, data: { active: false } });
    res.json(qt);
  } catch {
    res.status(404).json({ error: "Query type not found" });
  }
});

export default router;
