import { Router } from "express";
import path from "path";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { nextTicketNumber } from "../lib/ticketNumber";
import { pickAssignee } from "../lib/assignmentPicker";
import { sendReply, OutboundAttachment } from "../lib/gmail";
import { buildReplyHtml } from "../lib/emailFormat";
import { UPLOAD_DIR, upload } from "../lib/uploads";

const router = Router();

// Gmail caps total outbound message size (body + all attachments) at 25MB.
// Stay comfortably under that — if a reply's attachments exceed this, they
// still get saved and stay downloadable in the Hub, but aren't attached to
// the outbound email itself (with a note added to the email body instead of
// a failed/bounced send).
const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

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

router.post("/:id/comments", requireAuth, upload.array("files", 5), async (req, res) => {
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

  // Files attached to this reply — same upload mechanics as
  // routes/attachments.ts (multer already wrote them to UPLOAD_DIR;
  // there's just a DB record to create here), any type accepted (Excel,
  // PDF, images, ...), same as an inbound email attachment would be.
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length > 0) {
    const created = await prisma.$transaction(
      files.map((f) =>
        prisma.attachment.create({
          data: {
            srId: id,
            commentId: comment.id,
            filename: f.originalname,
            storedPath: f.filename,
            mimeType: f.mimetype,
            size: f.size,
            uploadedById: req.user!.id,
          },
        })
      )
    );
    comment.attachments = created;
  }

  // This ticket originated by email — send the reply back to the plant
  // staff member's inbox too, threaded under the original conversation.
  // A send failure never blocks the in-app reply, but it IS reported back
  // in the response (emailDelivery, below) so the UI can warn instead of
  // silently implying the plant staff member got it.
  let emailDelivery: { status: "sent" | "failed"; error?: string } | null = null;
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
      // like a normal mail client reply would. Plain-text version keeps the
      // "> "-prefixed quote (for clients/log views that only read text/
      // plain); the HTML version (buildReplyHtml) renders the same content
      // as a proper indented blockquote instead, since several clients
      // (Outlook especially) show literal ">" characters rather than a
      // visual quote when a plain-text-only mail is quote-prefixed.
      const quotedHeader = `On ${sr.createdAt.toUTCString()}, ${sr.requester.name} <${sr.requester.email}> wrote:`;
      const quotedBody = sr.body
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");

      // Attachments: attach files that fit under Gmail's size cap; the rest
      // still stay saved and downloadable in the Hub, with a note in the
      // reply body pointing there instead of a bounced send.
      const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
      let attachments: OutboundAttachment[] | undefined;
      let sizeNote = "";
      if (files.length > 0) {
        if (totalBytes <= MAX_EMAIL_ATTACHMENT_BYTES) {
          attachments = files.map((f) => ({
            filename: f.originalname,
            path: path.join(UPLOAD_DIR, f.filename),
            contentType: f.mimetype,
          }));
        } else {
          sizeNote = `(${files.length} attachment(s) too large to email — view them in RDC Hub.)`;
        }
      }

      // A visible ticket reference in the body — Gmail's conversation view
      // shows only the thread's original subject, hiding the "[SR-n] Re: …"
      // we set on the reply's Subject header, so plant staff (and anyone
      // Cc'd) otherwise have no ticket number to quote back.
      const refLine = `Ref: ${sr.ticketNumber} — please keep this reference on any reply. Sent via RDC Hub.`;
      const replyBody = sizeNote ? `${parsed.data.body}\n\n${sizeNote}` : parsed.data.body;
      const text = `${replyBody}\n\n${refLine}\n\n${quotedHeader}\n${quotedBody}`;
      const html = buildReplyHtml({
        replyText: replyBody,
        footer: refLine,
        quoted: { header: quotedHeader, body: sr.body },
      });

      const { messageId } = await sendReply({
        threadId: sr.gmailThreadId,
        to: sr.requester.email,
        cc,
        subject: `[${sr.ticketNumber}] Re: ${sr.subject}`,
        text,
        html,
        inReplyTo: sr.lastEmailMessageId,
        references: sr.lastEmailMessageId,
        attachments,
      });
      await prisma.serviceRequest.update({ where: { id }, data: { lastEmailMessageId: messageId } });
      emailDelivery = { status: "sent" };
    } catch (err) {
      console.error(`[requests] Could not email reply for SR ${sr.ticketNumber}:`, err);
      emailDelivery = { status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  res.status(201).json({ ...comment, emailDelivery });
});

export default router;
