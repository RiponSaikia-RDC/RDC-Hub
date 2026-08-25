import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { UPLOAD_DIR, upload } from "../lib/uploads";

const router = Router();

async function canAccessSr(userId: number, role: string, srId: number) {
  const sr = await prisma.serviceRequest.findUnique({ where: { id: srId } });
  if (!sr) return false;
  if (role === "ADMIN") return true;
  if (role === "PLANT_STAFF") return sr.requesterId === userId;
  if (role === "MEMBER") return sr.assignedToId === userId;
  return false;
}

// Upload one or more files against an SR (optionally tied to a specific comment).
router.post("/requests/:id/attachments", requireAuth, upload.array("files", 5), async (req, res) => {
  const srId = Number(req.params.id);
  const allowed = await canAccessSr(req.user!.id, req.user!.role, srId);
  if (!allowed) return res.status(403).json({ error: "You don't have access to this request" });

  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) return res.status(400).json({ error: "No files uploaded" });

  const commentId = req.body.commentId ? Number(req.body.commentId) : null;

  const created = await prisma.$transaction(
    files.map((f) =>
      prisma.attachment.create({
        data: {
          srId,
          commentId: commentId ?? undefined,
          filename: f.originalname,
          storedPath: f.filename,
          mimeType: f.mimetype,
          size: f.size,
          uploadedById: req.user!.id,
        },
      })
    )
  );
  res.status(201).json(created);
});

// Download/view a single attachment (auth-gated by the parent SR's access rules).
router.get("/attachments/:id/download", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return res.status(404).json({ error: "File not found" });

  const allowed = await canAccessSr(req.user!.id, req.user!.role, attachment.srId);
  if (!allowed) return res.status(403).json({ error: "You don't have access to this file" });

  const filePath = path.join(UPLOAD_DIR, attachment.storedPath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing on server" });

  res.download(filePath, attachment.filename);
});

export default router;
