// Shared multer disk-storage config for file uploads attached to a request
// or a reply — used by both routes/attachments.ts (standalone upload) and
// routes/requests.ts (files attached directly to a reply). Centralized so
// both stay in sync on where files land and how they're named.
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";

export const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// No mimetype allow-list: attachments are opaque blobs to the Hub, same as
// they are to an email client — Excel, PDF, images, Word docs, zips, etc.
// are all accepted as-is, matching what a plant staff member could send by
// email. Size is the only guard.
export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const unique = crypto.randomBytes(16).toString("hex");
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per file
});
