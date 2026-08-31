import { Router } from "express";
import path from "path";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { nextTicketNumber } from "../lib/ticketNumber";
import { pickAssignee } from "../lib/assignmentPicker";
import { convert as htmlToText } from "html-to-text";
import { sendReply, OutboundAttachment } from "../lib/gmail";
import { sanitizeOutboundHtml } from "../lib/emailHtml";
import { buildReplyEmail, TrailMessage } from "../lib/replyEmail";
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
  // Plain-text body — always sent (the editor's text content, or the raw
  // textarea value). Kept as the searchable/preview body.
  body: z.string().min(1),
  // Rich-text body from the Hub reply editor, if the member used formatting.
  // Sanitised server-side before it's stored or emailed.
  bodyHtml: z.string().optional(),
  // Extra recipients to Cc on this reply, on top of whoever was on the
  // original email's To/Cc — comma/semicolon/whitespace separated.
  cc: z.string().optional(),
});

const TRAIL_MAX = 20; // cap how many prior messages get quoted into a reply

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
    include: {
      requester: { select: { name: true, email: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!sr) return res.status(404).json({ error: "Request not found" });
  if (!canView(req.user!, sr)) return res.status(403).json({ error: "You don't have access to this request" });

  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Comment body is required" });

  const replyHtml = sanitizeOutboundHtml(parsed.data.bodyHtml);
  // When the member used the rich editor, derive the plain-text body from
  // the (sanitised) HTML here — html-to-text keeps paragraph breaks that a
  // browser-side textContent grab would flatten. Fall back to whatever plain
  // text the client sent for the no-formatting case.
  const plainFromHtml = replyHtml ? htmlToText(replyHtml, { wordwrap: false }).trim() : "";
  const body = plainFromHtml || parsed.data.body.trim() || "(no message body)";

  const comment = await prisma.comment.create({
    data: { srId: id, authorId: req.user!.id, body, bodyHtml: replyHtml || null },
    include: { author: { select: { id: true, name: true, role: true, email: true } }, attachments: true },
  });
  // Fetched separately (never on `comment`, which is returned to the
  // client as-is below) so the encrypted token blob never leaves the
  // server.
  const sender = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { gmailRefreshTokenEnc: true },
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

  // This ticket originated by email — send the reply to the plant staff
  // member's inbox as a STANDALONE message (not threaded), so the
  // "[SR-n] Re: …" subject shows in Gmail's conversation list; the whole
  // prior conversation is quoted below the reply instead (see replyEmail.ts).
  // A send failure never blocks the in-app reply, but it IS reported back
  // in the response (emailDelivery, below) so the UI can warn.
  let emailDelivery: { status: "sent" | "failed"; error?: string; sentAs?: string; warning?: string } | null = null;
  if (sr.source === "EMAIL" && sr.requester.email) {
    try {
      const hubEmail = (process.env.GMAIL_HUB_EMAIL || "").toLowerCase();
      // Cc list: the shared hub mailbox always (so it keeps a copy of every
      // outbound reply regardless of who sent it, and aren't threaded), plus
      // everyone who was on the original email's To/Cc, plus whatever the
      // replying member added. Minus the primary requester, who's already
      // the "To".
      const autoCc = [...parseEmailList(sr.originalToRaw), ...parseEmailList(sr.originalCcRaw)];
      const manualCc = parseEmailList(parsed.data.cc);
      const cc = Array.from(new Set([hubEmail, ...autoCc, ...manualCc]))
        .filter((e) => e && e !== sr.requester.email!.toLowerCase());

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

      const refLine = `Ref: ${sr.ticketNumber} — please keep this reference on any reply. Sent via RDC Hub.`;

      // Build the quoted trail newest-first: the most recent prior comment
      // down to the oldest, then the original request last. The comment we
      // just created is excluded; capped at TRAIL_MAX.
      const priorComments = sr.comments.filter((c) => c.id !== comment.id);
      const trail: TrailMessage[] = [
        ...priorComments
          .slice()
          .reverse()
          .map((c) => ({ author: c.author.name, date: c.createdAt, text: c.body, html: c.bodyHtml })),
        {
          author: sr.requester.name,
          email: sr.requester.email,
          date: sr.createdAt,
          text: sr.body,
          html: sr.bodyHtml,
        },
      ].slice(0, TRAIL_MAX);

      const { text, html } = buildReplyEmail({
        replyHtml,
        replyText: body,
        refLine,
        sizeNote,
        trail,
      });

      const { messageId, sentAs, fellBackToHub } = await sendReply({
        to: sr.requester.email,
        cc,
        subject: `[${sr.ticketNumber}] Re: ${sr.subject}`,
        text,
        html,
        attachments,
        fromEmail: comment.author.email,
        fromName: comment.author.name,
        fromRefreshTokenEnc: sender?.gmailRefreshTokenEnc || undefined,
      });
      await prisma.serviceRequest.update({ where: { id }, data: { lastEmailMessageId: messageId } });
      // Sent fine either way, but flag it when it didn't go out as the
      // replying member themselves (e.g. their account's email isn't a
      // real mailbox, or per-member sending isn't set up) so that doesn't
      // silently go unnoticed.
      emailDelivery = fellBackToHub
        ? {
            status: "sent",
            sentAs,
            warning: sender?.gmailRefreshTokenEnc
              ? `Sent as ${sentAs} instead of ${comment.author.email} — the connected Gmail account couldn't be used. Ask an admin to run "npm run gmail:connect" again for this account.`
              : `Sent as ${sentAs} instead of ${comment.author.email} — this account hasn't connected Gmail yet. Ask an admin to run "npm run gmail:connect" for it.`,
          }
        : { status: "sent", sentAs };
    } catch (err) {
      console.error(`[requests] Could not email reply for SR ${sr.ticketNumber}:`, err);
      emailDelivery = { status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  res.status(201).json({ ...comment, emailDelivery });
});

export default router;
