import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy. Next.js injects inline bootstrap scripts, so
// 'unsafe-inline' is needed for scripts unless nonces are wired up; everything
// else is locked to same-origin. No third-party scripts are loaded.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://coin-images.coingecko.com https://assets.coingecko.com",
  "font-src 'self' data:",
  // Live prices: Binance public market-data WebSocket (read-only, no credentials).
  "connect-src 'self' wss://stream.binance.com:9443 wss://data-stream.binance.vision",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // Standalone output is used for the Docker image (BUILD_STANDALONE=1); local `next start` uses the normal build.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "web-push", "nodemailer", "pg", "@prisma/adapter-pg"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
