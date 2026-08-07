import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me-before-hosting";
const TOKEN_TTL = "12h";

export type Role = "ADMIN" | "MEMBER" | "PLANT_STAFF";

export interface TokenPayload {
  userId: number;
  role: Role;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export const AUTH_COOKIE_NAME = "rdc_hub_token";

/*
 * --- Future AD / SSO note ---
 * This module is the only place credential verification happens. To swap
 * local username/password login for company AD or Azure AD/Entra SSO:
 *   1. Replace the verifyPassword() check in routes/auth.ts's /login
 *      handler with an LDAP bind (e.g. via `ldapjs`/`passport-ldapauth`)
 *      or an OIDC/SAML flow (e.g. `passport-azure-ad`).
 *   2. Keep issuing the same signToken()/AUTH_COOKIE_NAME session — every
 *      downstream route, the requireAuth middleware, and the frontend
 *      AuthContext stay unchanged.
 *   3. Map the AD user to a local User row (create-on-first-login keyed by
 *      email/UPN) so role, plant, and query-type assignment rights keep
 *      working exactly as they do now.
 */
