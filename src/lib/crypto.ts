import crypto from "crypto";

// ---------------------------------------------------------------------------
// Encryption at rest for message bodies.
//
// This protects message text in the database itself: a leaked DB dump or
// backup shows ciphertext, not readable messages. The server still holds the
// key and CAN read messages (that's required for search, threads, web access,
// etc.) — so this is NOT end-to-end encryption. It's a strong at-rest layer
// on top of Neon's storage-level encryption.
//
// Format stored in DB:  "<iv-base64>:<authtag-base64>:<ciphertext-base64>"
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM

function getKey(): Buffer {
  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "MESSAGE_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "MESSAGE_ENCRYPTION_KEY must decode to exactly 32 bytes (use: openssl rand -base64 32)"
    );
  }
  return key;
}

export function encryptMessage(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptMessage(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    // Tolerate unreadable rows rather than crashing a whole channel view.
    return "[unable to decrypt message]";
  }
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getKey(),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return "[unable to decrypt message]";
  }
}
