import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@ai-note/api-client", "@ai-note/shared", "@ai-note/ui"],
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.API_INTERNAL_URL?.trim() || "http://127.0.0.1:4000/api/v1"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
