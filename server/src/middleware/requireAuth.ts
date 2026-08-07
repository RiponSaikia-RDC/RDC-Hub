import { Request, Response, NextFunction } from "express";
import { AUTH_COOKIE_NAME, Role, verifyToken } from "../lib/auth";
import { prisma } from "../lib/prisma";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: Role;
        name: string;
        email: string;
        plantId: number | null;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Session expired, please log in again" });

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.active) return res.status(401).json({ error: "Account not found or inactive" });

  req.user = {
    id: user.id,
    role: user.role as Role,
    name: user.name,
    email: user.email,
    plantId: user.plantId,
  };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have permission to do that" });
    }
    next();
  };
}
