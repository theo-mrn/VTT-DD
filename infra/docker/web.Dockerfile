# syntax=docker/dockerfile:1.7
# Nouveau front Next.js (apps/web) en mode standalone : docker build -f infra/docker/web.Dockerfile .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-trixie-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
# pnpm installé directement : le corepack livré avec Node 22 peut rejeter
# les signatures des versions récentes de pnpm
RUN npm install -g pnpm@10.28.0 --no-fund --no-audit
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
# Tous les manifests du workspace : sans eux, --frozen-lockfile refuse le lockfile
COPY apps/web/package.json ./apps/web/
COPY apps/legacy/package.json ./apps/legacy/
COPY services/gateway/package.json ./services/gateway/
COPY services/identity/package.json ./services/identity/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/platform/package.json ./packages/platform/
COPY tools/firebase-export/package.json ./tools/firebase-export/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@vtt/web..."
COPY apps/web ./apps/web
# Les réécritures /v1/* sont figées au build : URL interne de la gateway dans le cluster
ARG API_URL=http://gateway:3000
RUN API_URL=$API_URL pnpm --filter @vtt/web build

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
ARG VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/theo-mrn/VTT-DD" \
      org.opencontainers.image.title="vtt-web" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/public ./apps/web/public
USER nonroot
EXPOSE 3000
CMD ["apps/web/server.js"]
