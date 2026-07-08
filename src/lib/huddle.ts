// Shared between the huddle API routes (server) and HuddleBar (client) — no
// secrets involved, so unlike pusher.ts this is safe to import from both.
// LiveKit participant metadata is a free-form string; this is the one shape
// this app puts in it, so a participant's profile photo travels with them
// (both in the live LiveKit room and in RoomServiceClient.listParticipants)
// without a separate lookup.

export function encodeParticipantMetadata(image: string | null): string {
  return JSON.stringify({ image });
}

export function decodeParticipantImage(metadata: string | undefined): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    return typeof parsed.image === "string" ? parsed.image : null;
  } catch {
    return null;
  }
}
