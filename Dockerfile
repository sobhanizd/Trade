# syntax=docker/dockerfile:1.7
# CryptoPilot AI — two runtime targets from one build:
#   web    : Next.js standalone server (small)
#   worker : scheduler + migrations + CLI scripts (full source & deps)

FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
# Placeholder URL: generate/build never connect to a database; no credentials are baked into the image.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate && BUILD_STANDALONE=1 npx next build

# ── web ──────────────────────────────────────────────────────────────────────
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 app
COPY --from=build --chown=app /app/.next/standalone ./
COPY --from=build --chown=app /app/.next/static ./.next/static
COPY --from=build --chown=app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ── worker ───────────────────────────────────────────────────────────────────
FROM base AS worker
ENV NODE_ENV=production
RUN useradd --system --uid 1001 app
COPY --from=build --chown=app /app ./
USER app
CMD ["npx", "tsx", "worker/index.ts"]
