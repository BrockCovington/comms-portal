"use client";

import PusherClient from "pusher-js";

// A single shared client for the whole browser session. Only the PUBLIC key
// and cluster are used here (safe to expose) — the secret stays on the server.
let client: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (!client) {
    client = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      // Private channels call this endpoint to prove the user is allowed in.
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
      },
    });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Ref-counted subscribe/unsubscribe.
//
// Multiple hooks (e.g. useMessages for the channel view and useThread for an
// open thread panel) can both be bound to the same Pusher channel at once.
// pusher-js's own subscribe() is idempotent, but unsubscribe() tears the
// channel down unconditionally — if two hooks shared it, the one that
// unmounts first would kill the subscription out from under the other. These
// wrappers keep a local ref count so the underlying channel only goes away
// once every consumer has released it.
// ---------------------------------------------------------------------------
const refCounts = new Map<string, number>();

export function subscribeChannel(name: string) {
  refCounts.set(name, (refCounts.get(name) ?? 0) + 1);
  return getPusherClient().subscribe(name);
}

export function unsubscribeChannel(name: string): void {
  const count = (refCounts.get(name) ?? 1) - 1;
  if (count <= 0) {
    refCounts.delete(name);
    getPusherClient().unsubscribe(name);
  } else {
    refCounts.set(name, count);
  }
}
