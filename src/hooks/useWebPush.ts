"use client";

import { useCallback, useEffect, useState } from "react";

// The VAPID public key is genuinely public (it's shared with the push service
// to authenticate our sends), so it ships in the client bundle. Absent = push
// isn't configured on this deployment, and the hook reports unsupported.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// The PushManager wants the application server key as a Uint8Array, not the
// base64url string we carry in env — convert it.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type PushState = {
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermission | "unsupported";
  busy: boolean;
};

// Manages Web Push for the current browser: registers the service worker,
// tracks whether an active subscription exists, and enable()/disable() to
// subscribe (asking permission) or unsubscribe. Server registration of the
// subscription happens through /api/push/{subscribe,unsubscribe}. All of this
// is per-device — each browser is its own subscription — matching how Slack's
// desktop vs. browser notifications work independently.
export function useWebPush(): PushState & { enable: () => Promise<void>; disable: () => Promise<void> } {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    Boolean(VAPID_PUBLIC_KEY);

  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported"
  );
  const [busy, setBusy] = useState(false);

  // Register the SW and reflect any existing subscription on mount.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setEnabled(Boolean(sub));
      })
      .catch(() => {
        // A registration failure just leaves push disabled — the in-app
        // notifications still work, so it's not worth surfacing.
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
        }));

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (res.ok) setEnabled(true);
    } catch {
      // Leave enabled=false; the toggle simply won't flip on.
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  const disable = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  return { supported, enabled, permission, busy, enable, disable };
}
