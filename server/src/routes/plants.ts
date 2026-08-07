import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/requireAuth";

const router = Router();

// Anyone logged in can list plants (needed for the New Request form, user forms, etc.)
router.get("/", requireAuth, async (_req, res) => {
  const plants = await prisma.plant.findMany({ orderBy: { name: "asc" } });
  res.json(plants);
});

const plantSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = plantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Name and code are required" });
  try {
    const plant = await prisma.plant.create({ data: parsed.data });
    res.status(201).json(plant);
  } catch {
    res.status(409).json({ error: "A plant with that name or code already exists" });
  }
});

router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = plantSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data" });
  try {
    const plant = await prisma.plant.update({ where: { id }, data: parsed.data });
    res.json(plant);
  } catch {
    res.status(404).json({ error: "Plant not found" });
  }
});

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.plant.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "Cannot delete a plant that is in use" });
  }
});

export default router;
