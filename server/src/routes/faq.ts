import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { bulkSummary, csvUpload, MAX_BULK_ROWS, parseCsv, type BulkResultRow } from "../lib/csv";

const router = Router();

// Search/list Common Questions. `q` does a keyword search over question+answer;
// with no `q`, results are newest-first so staff can browse what's recently answered.
router.get("/", requireAuth, async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const queryTypeId = req.query.queryTypeId ? Number(req.query.queryTypeId) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;

  const entries = await prisma.faqEntry.findMany({
    where: {
      ...(queryTypeId ? { queryTypeId } : {}),
      ...(q
        ? { OR: [{ question: { contains: q } }, { answer: { contains: q } }] }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { queryType: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } },
  });
  res.json(entries);
});

const createSchema = z.object({
  question: z.string().min(3),
  answer: z.string().min(1),
  queryTypeId: z.number().int().optional().nullable(),
  sourceSrId: z.number().int().optional().nullable(),
});

// Members and admins can add FAQ entries (typically by "promoting" a resolved SR).
router.post("/", requireAuth, requireRole("ADMIN", "MEMBER"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid data" });

  const entry = await prisma.faqEntry.create({
    data: { ...parsed.data, createdById: req.user!.id },
    include: { queryType: { select: { id: true, name: true } } },
  });
  res.status(201).json(entry);
});

// Bulk import via CSV. Expected headers: question, answer, querytype (optional, matched by name).
router.post("/bulk", requireAuth, requireRole("ADMIN", "MEMBER"), csvUpload.single("file"), async (req, res) => {
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

  const [existingEntries, queryTypes] = await Promise.all([
    prisma.faqEntry.findMany({ select: { question: true } }),
    prisma.queryType.findMany({ select: { id: true, name: true } }),
  ]);
  const seenQuestions = new Set(existingEntries.map((e) => e.question.trim().toLowerCase()));
  const queryTypeByName = new Map(queryTypes.map((qt) => [qt.name.toLowerCase(), qt.id]));

  const results: BulkResultRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];
    const question = row.question?.trim();
    const answer = row.answer?.trim();
    const queryTypeName = row.querytype?.trim();

    const base = { row: rowNum, question };

    if (!question || !answer) {
      results.push({ ...base, status: "error", message: "question and answer are both required" });
      continue;
    }

    let queryTypeId: number | null = null;
    if (queryTypeName) {
      const found = queryTypeByName.get(queryTypeName.toLowerCase());
      if (!found) {
        results.push({ ...base, status: "error", message: `unknown query type "${queryTypeName}"` });
        continue;
      }
      queryTypeId = found;
    }

    if (seenQuestions.has(question.toLowerCase())) {
      results.push({ ...base, status: "skipped", message: "already exists" });
      continue;
    }

    try {
      await prisma.faqEntry.create({
        data: { question, answer, queryTypeId, createdById: req.user!.id },
      });
      seenQuestions.add(question.toLowerCase());
      results.push({ ...base, status: "created" });
    } catch {
      results.push({ ...base, status: "error", message: "could not create this row" });
    }
  }

  res.json({ summary: bulkSummary(results), results });
});

const updateSchema = createSchema.partial();

router.patch("/:id", requireAuth, requireRole("ADMIN", "MEMBER"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data" });
  try {
    const entry = await prisma.faqEntry.update({ where: { id }, data: parsed.data });
    res.json(entry);
  } catch {
    res.status(404).json({ error: "FAQ entry not found" });
  }
});

router.delete("/:id", requireAuth, requireRole("ADMIN", "MEMBER"), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.faqEntry.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "FAQ entry not found" });
  }
});

// Bump the view counter when a staff member actually opens an answer
// (used to surface the most useful entries over time).
router.post("/:id/view", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const entry = await prisma.faqEntry.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    res.json(entry);
  } catch {
    res.status(404).json({ error: "FAQ entry not found" });
  }
});

export default router;
