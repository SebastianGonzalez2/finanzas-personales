import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  // OAuth callback URLs contain private authorization codes/state. Avoid
  // development request logs and browser/server-function argument forwarding.
  logging: {
    incomingRequests: false,
    browserToTerminal: false,
    serverFunctions: false,
  },
};

export default nextConfig;
