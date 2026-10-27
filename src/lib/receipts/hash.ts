import { createHash, randomBytes } from "crypto";

export function sha256Hex(input: string | Buffer | Uint8Array) {
  return createHash("sha256").update(input).digest("hex");
}

export function generateInboxToken() {
  // Opaque, URL-safe, not derived from user/org ids
  return randomBytes(18).toString("base64url");
}

export function hashInboxToken(token: string) {
  return sha256Hex(token.trim().toLowerCase());
}
