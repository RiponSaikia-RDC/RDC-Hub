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
    const qt = await prisma.queryType.update({ where: { id }, data: parsed.data });
    res.json(qt);
  } catch {
    res.status(404).json({ error: "Query type not found" });
  }
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
