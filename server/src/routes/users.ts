import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { requireAuth, requireRole } from "../middleware/requireAuth";

const router = Router();

const userSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  role: true,
  active: true,
  plantId: true,
  createdAt: true,
  plant: true,
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
  password: z.string().min(6),
  role: z.enum(["ADMIN", "MEMBER", "PLANT_STAFF"]),
  plantId: z.number().int().optional().nullable(),
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid data" });

  const { password, ...rest } = parsed.data;
  try {
    const user = await prisma.user.create({
      data: { ...rest, passwordHash: await hashPassword(password) },
      select: userSelect,
    });
    res.status(201).json(user);
  } catch {
    res.status(409).json({ error: "A user with that email or username already exists" });
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
  if (password) data.passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.update({ where: { id }, data, select: userSelect });
    res.json(user);
  } catch {
    res.status(404).json({ error: "User not found" });
  }
});

export default router;
