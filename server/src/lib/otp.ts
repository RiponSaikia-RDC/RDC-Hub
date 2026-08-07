import crypto from "crypto";

export const OTP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — admin relays it manually for now

/** 6-digit numeric OTP, easy to read/type/relay over chat or phone. */
export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function otpExpiry(): Date {
  return new Date(Date.now() + OTP_TTL_MS);
}
