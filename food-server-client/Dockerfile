FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build args are baked into the Next.js bundle at build time
ARG NEXT_PUBLIC_GRAPHQL_ENDPOINT
ARG NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT
ENV NEXT_PUBLIC_GRAPHQL_ENDPOINT=$NEXT_PUBLIC_GRAPHQL_ENDPOINT
ENV NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT=$NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT
# Enable standalone output for Docker (not used on Vercel)
ENV NEXT_STANDALONE=1
RUN echo 'import type { NextConfig } from "next"; const c: NextConfig = { reactCompiler: true, output: "standalone" }; export default c;' > next.config.ts
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
