/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SAE / Docker 部署：把所有运行时依赖打到 .next/standalone, 直接 node server.js 启动
  output: "standalone",
  // 关掉构建时遥测, 加速镜像构建
  // (NEXT_TELEMETRY_DISABLED=1 也行, 这里冗余写一遍)
  poweredByHeader: false,
  experimental: {
    // 禁用客户端 Router Cache：每次点击侧边栏切页都重新向服务端请求数据，
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
};

export default nextConfig;
