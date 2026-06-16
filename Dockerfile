# --- 多阶段构建 ---
# 1. deps     : 装依赖 (含 dev, build 用)
# 2. builder  : next build → .next/standalone
# 3. runner   : 最小运行时 (alpine + node + 必要静态文件)
#
# 镜像最终 ~150MB, 启动 < 1s
#
# Base image 走 DaoCloud 镜像加速 (国内 CI 构建机直连 docker.io 会 timeout)
# ARG 暴露出来便于本地或海外环境覆盖: --build-arg NODE_IMAGE=node:20-alpine
ARG NODE_IMAGE=docker.m.daocloud.io/library/node:20-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 公开环境变量需要在构建时注入, 才能烤进 client bundle
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
# 服务端(含 middleware)访问 Supabase 的 VPC 内网地址 — 构建期注入以便 middleware 内联.
# 默认即生产 VPC 地址; 可用 --build-arg 覆盖.
ARG SUPABASE_SERVER_URL=http://172.23.91.48:80
ENV SUPABASE_SERVER_URL=${SUPABASE_SERVER_URL}
RUN npm run build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 运行时服务端访问 Supabase 的 VPC 内网地址 (server component 运行时读取);
# 可被 SAE 环境变量覆盖.
ARG SUPABASE_SERVER_URL=http://172.23.91.48:80
ENV SUPABASE_SERVER_URL=${SUPABASE_SERVER_URL}

# Next.js standalone 包含运行所需的最小 node_modules 子集
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 非 root 用户运行
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

# SAE 健康检查路径: /api/health (见 app/api/health/route.ts)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
