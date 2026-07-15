import { decryptMessage } from "@/lib/crypto";

// The embedded-original data a forwarded message carries to the client.
export type ForwardedData = {
  sourceLabel: string;
  sourceIsDm: boolean;
  sourceAuthorName: string | null;
  body: string;
  originalCreatedAt: Date;
};

type ForwardedRow = {
  sourceLabel: string;
  sourceIsDm: boolean;
  sourceAuthorName: string | null;
  body: string; // ciphertext
  originalCreatedAt: Date;
};

// Decrypt a stored ForwardedMessage row for the client — the read-side
// counterpart to how the forward route snapshots the original (encrypted).
// Shared by the message and thread GET routes.
export function decryptForwarded(row: ForwardedRow): ForwardedData {
  return {
    sourceLabel: row.sourceLabel,
    sourceIsDm: row.sourceIsDm,
    sourceAuthorName: row.sourceAuthorName,
    body: decryptMessage(row.body),
    originalCreatedAt: row.originalCreatedAt,
  };
}
