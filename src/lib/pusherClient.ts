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
