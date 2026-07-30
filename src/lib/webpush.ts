import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Web Push sender. Delivers a browser push notification to every device a user
// has subscribed (see POST /api/push/subscribe), so mentions/DMs reach them
// even when the tab is closed. Configured lazily from VAPID env: if the keys
// aren't set (e.g. a dev without them), sending is a no-op rather than an error
// — push is an enhancement on top of the in-app Pusher notification, never a
// hard dependency of message delivery.
// ---------------------------------------------------------------------------

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:notifications@example.com";
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type WebPushPayload = {
  title: string;
  body: string;
  // Deep link the notification click should open (a channel/thread URL).
  url: string;
  tag?: string;
};

// Fan a payload out to all of the given users' subscriptions. Best-effort:
// failures are logged, and a subscription the push service reports as gone
// (404/410) is pruned so it isn't retried forever. Never throws — callers run
// it via after() and must not have delivery affected by a push failure.
export async function sendWebPushToUsers(userIds: string[], payload: WebPushPayload): Promise<void> {
  if (!ensureConfigured() || userIds.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          stale.push(sub.id); // subscription no longer valid — drop it
        } else {
          console.error("Web push send failed:", statusCode ?? err);
        }
      }
    })
  );

  if (stale.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } }).catch(() => {});
  }
}
