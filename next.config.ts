import type { NextConfig } from "next";
import process from "node:process";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
