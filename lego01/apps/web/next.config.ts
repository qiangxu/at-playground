import type { NextConfig } from "next";

// Read ports from environment variables, with fallback defaults
const apiPort = process.env.API_PORT;
const webPort = process.env.WEB_PORT;
const webSslPort = process.env.SSL_PORT;

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // Dynamically allow origins based on environment variables
    allowedDevOrigins: [
      `http://localhost:${webPort}`,
      `https://localhost:${webSslPort}`,
      // 如果您还需要通过局域网 IP 访问，可以保留或动态生成
      // 注意：这里我们假设局域网访问也是通过 HTTP
      `http://192.168.3.180:${webPort}`, 
    ],
  },

  // Add rewrites to proxy API requests in development
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // Proxy to the backend API server using the dynamic port
        destination: `http://localhost:${apiPort}/:path*`, 
      },
    ]
  },
};

export default nextConfig;
