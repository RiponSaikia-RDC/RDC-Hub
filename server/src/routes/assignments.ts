import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/requireAuth";

const router = Router();

// The full member <-> query-type rights matrix, for the admin screen.
router.get("/", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const assignments = await prisma.queryTypeAssignment.findMany({
    include: { user: { select: { id: true, name: true } }, queryType: { select: { id: true, name: true } } },
  });
  res.json(assignments);
});

const assignSchema = z.object({
  userId: z.number().int(),
  queryTypeId: z.number().int(),
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "userId and queryTypeId are required" });

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user || user.role !== "MEMBER") {
    return res.status(400).json({ error: "Only users with the Member role can be assigned query types" });
  }

  try {
    const assignment = await prisma.queryTypeAssignment.create({ data: parsed.data });
    res.status(201).json(assignment);
  } catch {
    res.status(409).json({ error: "That member is already assigned to that query type" });
  }
});

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.queryTypeAssignment.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Assignment not found" });
  }
});

export default router;
