# syntax=docker/dockerfile:1.7
# Nouveau front Next.js (frontend) en mode standalone : docker build -f infra/docker/web.Dockerfile .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-trixie-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
# pnpm installé directement : le corepack livré avec Node 22 peut rejeter
# les signatures des versions récentes de pnpm
RUN npm install -g pnpm@10.28.0 --no-fund --no-audit
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
# Tous les manifests du workspace : sans eux, --frozen-lockfile refuse le lockfile
COPY frontend/package.json ./frontend/
COPY legacy/package.json ./legacy/
COPY backend/gateway/package.json ./backend/gateway/
COPY backend/identity/package.json ./backend/identity/
COPY backend/character/package.json ./backend/character/
COPY backend/campaign/package.json ./backend/campaign/
COPY backend/dice/package.json ./backend/dice/
COPY backend/billing/package.json ./backend/billing/
COPY backend/history/package.json ./backend/history/
COPY backend/realtime/package.json ./backend/realtime/
COPY backend/audio/package.json ./backend/audio/
COPY packages/contracts/package.json ./packages/contracts/
COPY backend/platform/package.json ./backend/platform/
COPY packages/rules/package.json ./packages/rules/
COPY packages/systemes/package.json ./packages/systemes/
COPY packages/vision/package.json ./packages/vision/
COPY tools/firebase-export/package.json ./tools/firebase-export/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@vtt/web..."
# Le front calcule les fiches avec le moteur de règles, lit les systèmes de référence, partage
# les contrats d'API et le calcul de visibilité de la carte avec le back
COPY packages/contracts ./packages/contracts
COPY packages/rules ./packages/rules
COPY packages/systemes ./packages/systemes
COPY packages/vision ./packages/vision
COPY frontend ./frontend
# Les réécritures /v1/* sont figées au build : URL interne de la gateway dans le cluster.
# « @vtt/web... » construit d'abord ses dépendances du workspace (rules, systemes).
ARG API_URL=http://gateway:3000
RUN API_URL=$API_URL pnpm --filter "@vtt/web..." build

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
ARG VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/theo-mrn/VTT-DD" \
      org.opencontainers.image.title="vtt-web" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /repo/frontend/.next/standalone ./
COPY --from=build --chown=nonroot:nonroot /repo/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=nonroot:nonroot /repo/frontend/public ./frontend/public
USER nonroot
EXPOSE 3000
CMD ["frontend/server.js"]
