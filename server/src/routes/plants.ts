import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { bulkSummary, csvUpload, MAX_BULK_ROWS, parseCsv, type BulkResultRow } from "../lib/csv";

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

// Bulk import via CSV. Expected headers: name, code.
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

  const existing = await prisma.plant.findMany({ select: { name: true, code: true } });
  const seenNames = new Set(existing.map((p) => p.name.toLowerCase()));
  const seenCodes = new Set(existing.map((p) => p.code.toLowerCase()));

  const results: BulkResultRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row
    const name = rows[i].name?.trim();
    const code = rows[i].code?.trim();

    if (!name || !code) {
      results.push({ row: rowNum, status: "error", message: "name and code are both required", name, code });
      continue;
    }
    if (seenNames.has(name.toLowerCase()) || seenCodes.has(code.toLowerCase())) {
      results.push({ row: rowNum, status: "skipped", message: "already exists", name, code });
      continue;
    }

    try {
      await prisma.plant.create({ data: { name, code } });
      seenNames.add(name.toLowerCase());
      seenCodes.add(code.toLowerCase());
      results.push({ row: rowNum, status: "created", name, code });
    } catch {
      results.push({ row: rowNum, status: "error", message: "could not create this row", name, code });
    }
  }

  res.json({ summary: bulkSummary(results), results });
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
