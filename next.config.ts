import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Security headers applied to every response.
const securityHeaders = [
  // Force HTTPS for 2 years, including subdomains.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Disallow this app from being embedded in an <iframe> (clickjacking defense).
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers from guessing/overriding declared content types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Turn off device APIs the app doesn't use — camera/microphone are
  // allowed for this origin only (huddles), everything else stays off.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' https: data:",
      // 'unsafe-eval' is only needed for Next's dev-mode Fast Refresh
      // (webpack's eval-based module runtime) — never shipped to production.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      // Pusher's WebSocket + HTTP-fallback transport, and LiveKit's signaling
      // WebSocket + REST calls (region lookup, connection validation) for
      // huddles. Same-origin API/fetch calls are already covered by 'self'.
      "connect-src 'self' https://*.pusher.com wss://*.pusher.com https://*.livekit.cloud wss://*.livekit.cloud",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
