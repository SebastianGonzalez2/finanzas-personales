import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  // Next.js emits inline bootstrap scripts and the UI uses inline styles.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  serverExternalPackages: ["pdfkit"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
  // OAuth callback URLs contain private authorization codes/state. Avoid
  // development request logs and browser/server-function argument forwarding.
  logging: {
    incomingRequests: false,
    browserToTerminal: false,
    serverFunctions: false,
  },
};

export default nextConfig;
