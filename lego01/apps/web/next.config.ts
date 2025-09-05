import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 仅开发环境有效：允许通过局域网 IP 访问 dev 服务器资源（/_next/*）
  experimental: {
    allowedDevOrigins: ['http://localhost:3000', 'http://192.168.3.180:3000'],
  },
};

export default nextConfig;
