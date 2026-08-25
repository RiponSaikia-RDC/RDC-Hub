import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { nextTicketNumber } from "../lib/ticketNumber";
import { pickAssignee } from "../lib/assignmentPicker";
import { sendReply } from "../lib/gmail";

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

  // Built as a list of AND-ed conditions (rather than one flat object) so
  // the free-text search's own OR clause and the role-based visibility OR
  // clause below don't clobber each other.
  const and: Record<string, unknown>[] = [];
  if (status) and.push({ status });
  if (queryTypeId) and.push({ queryTypeId: Number(queryTypeId) });
  if (plantId) and.push({ plantId: Number(plantId) });
  if (search) {
    and.push({ OR: [{ subject: { contains: search } }, { ticketNumber: { contains: search } }] });
  }

  if (req.user!.role === "PLANT_STAFF") {
    and.push({ requesterId: req.user!.id });
  } else if (req.user!.role === "MEMBER") {
    if (mine === "0") {
      // explicit opt-out not offered to members beyond their own queue
    }
    // Their own queue, plus anything unassigned — e.g. an inbound email
    // that matched no keyword lands here for any member to see and claim
    // (see the "teach routing" flow on the request detail page).
    and.push({ OR: [{ assignedToId: req.user!.id }, { assignedToId: null }] });
  } else if (req.user!.role === "ADMIN" && mine === "1") {
    and.push({ requesterId: req.user!.id });
  }
  // ADMIN with no `mine` filter sees everything, including unassigned.

  const requests = await prisma.serviceRequest.findMany({
    where: and.length ? { AND: and } : {},
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
  // Members can see their own queue plus anything unclaimed, so they can
  // act on it (claim it, or teach a keyword mapping for next time).
  if (user.role === "MEMBER") return sr.assignedToId === user.id || sr.assignedToId === null;
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
  // Lets whoever's handling a request (or claiming an unassigned one)
  // correct its category — useful right after teaching a keyword mapping
  // for a request that had matched nothing. See queryTypes.ts's /:id/learn.
  queryTypeId: z.number().int().optional(),
});

router.patch("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sr = await prisma.serviceRequest.findUnique({ where: { id } });
  if (!sr) return res.status(404).json({ error: "Request not found" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data" });

  const isAdmin = req.user!.role === "ADMIN";
  const isMember = req.user!.role === "MEMBER";
  const isAssignee = sr.assignedToId === req.user!.id;
  const isUnclaimed = sr.assignedToId === null;

  if (!isAdmin && !isAssignee && !(isMember && isUnclaimed)) {
    return res.status(403).json({ error: "Only the assigned member or an admin can update this request" });
  }
  if (parsed.data.assignedToId !== undefined && !isAdmin) {
    // Any member may claim/assign a request that's currently unassigned
    // (e.g. a no-keyword-match email) — to themselves or a colleague. Only
    // an admin may reassign one that's already someone else's.
    if (!isMember || !isUnclaimed) {
      return res.status(403).json({ error: "Only an admin can reassign a request that's already assigned to someone" });
    }
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "RESOLVED" || parsed.data.status === "CLOSED") {
    data.resolvedAt = new Date();
  }

  const updated = await prisma.serviceRequest.update({ where: { id }, data, include: detailInclude });
  res.json(updated);
});

const commentSchema = z.object({
  body: z.string().min(1),
  // Extra recipients to Cc on this reply, on top of whoever was on the
  // original email's To/Cc — comma/semicolon/whitespace separated.
  cc: z.string().optional(),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmailList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_RE.test(e));
}

router.post("/:id/comments", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sr = await prisma.serviceRequest.findUnique({
    where: { id },
    include: { requester: { select: { name: true, email: true } } },
  });
  if (!sr) return res.status(404).json({ error: "Request not found" });
  if (!canView(req.user!, sr)) return res.status(403).json({ error: "You don't have access to this request" });

  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Comment body is required" });

  const comment = await prisma.comment.create({
    data: { srId: id, authorId: req.user!.id, body: parsed.data.body },
    include: { author: { select: { id: true, name: true, role: true } }, attachments: true },
  });

  // This ticket originated by email — send the reply back to the plant
  // staff member's inbox too, threaded under the original conversation.
  // A send failure is logged but never blocks the in-app reply.
  if (sr.source === "EMAIL" && sr.gmailThreadId) {
    try {
      const hubEmail = (process.env.GMAIL_HUB_EMAIL || "").toLowerCase();
      // Carry forward everyone who was on the original email's To/Cc
      // (minus the hub address itself and the primary requester, who's
      // already the "To" here), plus whatever the replying member added.
      const autoCc = [...parseEmailList(sr.originalToRaw), ...parseEmailList(sr.originalCcRaw)];
      const manualCc = parseEmailList(parsed.data.cc);
      const cc = Array.from(new Set([...autoCc, ...manualCc])).filter(
        (e) => e !== hubEmail && e !== sr.requester.email.toLowerCase()
      );

      // Keep the original triggering email quoted below the new reply,
      // like a normal mail client reply would.
      const quotedHeader = `On ${sr.createdAt.toUTCString()}, ${sr.requester.name} <${sr.requester.email}> wrote:`;
      const quotedBody = sr.body
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      const text = `${parsed.data.body}\n\n${quotedHeader}\n${quotedBody}`;

      const { messageId } = await sendReply({
        threadId: sr.gmailThreadId,
        to: sr.requester.email,
        cc,
        subject: `[${sr.ticketNumber}] Re: ${sr.subject}`,
        text,
        inReplyTo: sr.lastEmailMessageId,
        references: sr.lastEmailMessageId,
      });
      await prisma.serviceRequest.update({ where: { id }, data: { lastEmailMessageId: messageId } });
    } catch (err) {
      console.error(`[requests] Could not email reply for SR ${sr.ticketNumber}:`, err);
    }
  }

  res.status(201).json(comment);
});

export default router;
