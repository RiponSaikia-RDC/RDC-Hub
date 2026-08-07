import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { nextTicketNumber } from "../lib/ticketNumber";
import { pickAssignee } from "../lib/assignmentPicker";

const router = Router();

const detailInclude = {
  queryType: true,
  plant: true,
  requester: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  attachments: true,
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, name: true, role: true } }, attachments: true },
  },
};

const createSchema = z.object({
  subject: z.string().min(3),
  body: z.string().min(1),
  queryTypeId: z.number().int(),
  plantId: z.number().int(),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid data" });

  const { subject, body, queryTypeId, plantId } = parsed.data;
  const assignedToId = await pickAssignee(queryTypeId);

  // Ticket numbers are derived from a row count; retry a couple of times
  // in the rare case two requests race for the same number.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ticketNumber = await nextTicketNumber();
      const sr = await prisma.serviceRequest.create({
        data: {
          ticketNumber,
          subject,
          body,
          queryTypeId,
          plantId,
          requesterId: req.user!.id,
          assignedToId: assignedToId ?? undefined,
        },
        include: detailInclude,
      });
      return res.status(201).json(sr);
    } catch (err: any) {
      if (err?.code === "P2002" && attempt < 2) continue;
      console.error(err);
      return res.status(500).json({ error: "Could not create the request, please try again" });
    }
  }
});

router.get("/", requireAuth, async (req, res) => {
  const { status, queryTypeId, plantId, search, mine } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (queryTypeId) where.queryTypeId = Number(queryTypeId);
  if (plantId) where.plantId = Number(plantId);
  if (search) {
    where.OR = [
      { subject: { contains: search } },
      { ticketNumber: { contains: search } },
    ];
  }

  if (req.user!.role === "PLANT_STAFF") {
    where.requesterId = req.user!.id;
  } else if (req.user!.role === "MEMBER") {
    if (mine === "0") {
      // explicit opt-out not offered to members beyond their own queue
    }
    where.assignedToId = req.user!.id;
  } else if (req.user!.role === "ADMIN" && mine === "1") {
    where.requesterId = req.user!.id;
  }
  // ADMIN with no `mine` filter sees everything, including unassigned.

  const requests = await prisma.serviceRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      queryType: { select: { id: true, name: true } },
      plant: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  res.json(requests);
});

function canView(
  user: NonNullable<import("express").Request["user"]>,
  sr: { requesterId: number; assignedToId: number | null }
) {
  if (user.role === "ADMIN") return true;
  if (user.role === "PLANT_STAFF") return sr.requesterId === user.id;
  if (user.role === "MEMBER") return sr.assignedToId === user.id;
  return false;
}

router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sr = await prisma.serviceRequest.findUnique({ where: { id }, include: detailInclude });
  if (!sr) return res.status(404).json({ error: "Request not found" });
  if (!canView(req.user!, sr)) return res.status(403).json({ error: "You don't have access to this request" });
  res.json(sr);
});

const updateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  assignedToId: z.number().int().nullable().optional(),
});

router.patch("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sr = await prisma.serviceRequest.findUnique({ where: { id } });
  if (!sr) return res.status(404).json({ error: "Request not found" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data" });

  const isAdmin = req.user!.role === "ADMIN";
  const isAssignee = sr.assignedToId === req.user!.id;
  if (!isAdmin && !isAssignee) {
    return res.status(403).json({ error: "Only the assigned member or an admin can update this request" });
  }
  if (parsed.data.assignedToId !== undefined && !isAdmin) {
    return res.status(403).json({ error: "Only an admin can reassign a request" });
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "RESOLVED" || parsed.data.status === "CLOSED") {
    data.resolvedAt = new Date();
  }

  const updated = await prisma.serviceRequest.update({ where: { id }, data, include: detailInclude });
  res.json(updated);
});

const commentSchema = z.object({ body: z.string().min(1) });

router.post("/:id/comments", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sr = await prisma.serviceRequest.findUnique({ where: { id } });
  if (!sr) return res.status(404).json({ error: "Request not found" });
  if (!canView(req.user!, sr)) return res.status(403).json({ error: "You don't have access to this request" });

  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Comment body is required" });

  const comment = await prisma.comment.create({
    data: { srId: id, authorId: req.user!.id, body: parsed.data.body },
    include: { author: { select: { id: true, name: true, role: true } }, attachments: true },
  });
  res.status(201).json(comment);
});

export default router;
