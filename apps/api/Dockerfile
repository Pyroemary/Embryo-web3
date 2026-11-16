# Build from repo root: docker build -f apps/api/Dockerfile .
FROM node:22-slim AS build
RUN corepack enable && apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @embryo/api... \
 && pnpm --filter @embryo/roundup build \
 && pnpm --filter @embryo/api build \
 && pnpm deploy --filter @embryo/api --prod /out \
 && cp -r apps/api/dist apps/api/prisma /out/ \
 && cd /out && npx prisma generate

FROM node:22-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/* && useradd -r embryo
WORKDIR /app
COPY --from=build /out .
USER embryo
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
