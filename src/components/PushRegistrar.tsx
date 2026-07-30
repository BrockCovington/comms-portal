"use client";

import { useEffect } from "react";

// Registers the Web Push service worker app-wide, so a device that has already
// enabled push keeps receiving notifications on any page — not only while the
// Notifications panel (where the enable/disable toggle lives) happens to be
// open. Registration alone is inert: the SW only acts on a push event, which
// the push service sends solely to devices with an active subscription. So
// this is safe to run for everyone, including users who never enable push.
export function PushRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A registration failure just means no browser push on this device; the
      // in-app notifications still work, so it isn't worth surfacing.
    });
  }, []);
  return null;
}
