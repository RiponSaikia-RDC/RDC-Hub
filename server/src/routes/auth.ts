import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AUTH_COOKIE_NAME, hashPassword, signToken, verifyPassword } from "../lib/auth";
import { requireAuth } from "../middleware/requireAuth";
import type { Response } from "express";
import type { User } from "@prisma/client";

const router = Router();

function issueSession(res: Response, user: User) {
  const token = signToken({ userId: user.id, role: user.role as any });
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000,
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    plantId: user.plantId,
  };
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Username and password are required" });

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.active) return res.status(401).json({ error: "Invalid username or password" });

  // Plant Staff interact with RDC Hub by email only — see
  // server/src/lib/emailPoller.ts / gmail.ts — and never get Hub login.
  if (user.role === "PLANT_STAFF") {
    return res.status(403).json({
      error: `Plant Staff accounts don't have Hub access. Please email ${process.env.GMAIL_HUB_EMAIL || "your RDC Hub contact"} instead.`,
    });
  }

  if (!user.passwordHash) {
    return res.status(401).json({
      error: "This account hasn't been activated yet. Use the Activate Account page with the OTP you were given.",
      code: "NOT_ACTIVATED",
    });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid username or password" });

  res.json(issueSession(res, user));
});

router.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, email: true, username: true, role: true, plantId: true, plant: true },
  });
  res.json(user);
});

const activateSchema = z.object({
  username: z.string().min(1),
  otp: z.string().min(6).max(6),
  newPassword: z.string().min(6),
});

// First-login activation for bulk-imported users: no session required,
// just proof of the OTP that was relayed to them out-of-band.
router.post("/activate", async (req, res) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid data" });

  const { username, otp, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !user.active || !user.otpCode || !user.otpExpiresAt || user.role === "PLANT_STAFF") {
    return res.status(400).json({ error: "Invalid username or OTP" });
  }
  if (user.otpExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: "This OTP has expired. Ask an admin to generate a new one." });
  }

  const ok = await verifyPassword(otp, user.otpCode);
  if (!ok) return res.status(400).json({ error: "Invalid username or OTP" });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      activated: true,
      otpCode: null,
      otpExpiresAt: null,
    },
  });

  res.json(issueSession(res, updated));
});

export default router;
