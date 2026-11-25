import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  // 에이전트 규칙은 .AI/에서만 관리한다 (next dev의 AGENTS.md 자동 생성 끔)
  agentRules: false,
  // Allow the largest encrypted upload (20 MiB plus its AES-GCM tag) through the API rewrite.
  experimental: { proxyClientMaxBodySize: 20 * 1024 * 1024 + 16 },
  // 브라우저는 항상 같은 origin의 /api만 호출한다 (CORS 회피)
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
