import type { NextConfig } from "next";

// Security headers applied to every response.
// Note: a strict Content-Security-Policy is powerful but easy to misconfigure
// (it can block Next's scripts). A starter CSP is included but commented out —
// turn it on once the app is stable and you've confirmed nothing breaks.
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
  // Turn off device APIs the app doesn't use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // {
  //   key: "Content-Security-Policy",
  //   value: [
  //     "default-src 'self'",
  //     "img-src 'self' https: data:",
  //     "script-src 'self' 'unsafe-inline'",
  //     "style-src 'self' 'unsafe-inline'",
  //     "frame-ancestors 'none'",
  //     "base-uri 'self'",
  //     "form-action 'self'",
  //   ].join("; "),
  // },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
