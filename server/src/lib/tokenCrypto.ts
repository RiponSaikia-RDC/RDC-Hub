// AES-256-GCM encryption for secrets stored at rest in the database — right
// now just User.gmailRefreshTokenEnc (see gmailConnectUser.ts). Keyed by a
// hash of JWT_SECRET rather than a separate secret to manage; anyone who
// could steal the DB and read this could already forge a valid session
// token, so this isn't protecting against a stronger adversary than that
// already implies — it's here so a raw dump of dev.db (a backup, a stolen
// laptop) doesn't hand over live Gmail-send access on top of that.
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me-before-hosting";
const KEY = crypto.createHash("sha256").update(JWT_SECRET).digest(); // 32 bytes for AES-256
const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM

/** Returns a single string: base64(iv):base64(authTag):base64(ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted secret");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
