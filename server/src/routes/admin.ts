import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { isGmailConfigured } from "../lib/gmail";

const router = Router();

// Small status readout for the Admin Overview page: is email intake
// configured, and how did the last poll go. See server/src/lib/emailPoller.ts.
router.get("/email-status", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const status = await prisma.emailSyncStatus.findUnique({ where: { id: 1 } });
  res.json({
    configured: isGmailConfigured,
    lastPollAt: status?.lastPollAt ?? null,
    lastSuccessAt: status?.lastSuccessAt ?? null,
    lastError: status?.lastError ?? null,
  });
});

export default router;
