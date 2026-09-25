# syntax=docker/dockerfile:1.7
# Image générique des services Node : docker build --build-arg SERVICE=gateway -f infra/docker/service.Dockerfile .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-trixie-slim AS build
ARG SERVICE
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# pnpm installé directement : le corepack livré avec Node 22 peut rejeter
# les signatures des versions récentes de pnpm
RUN npm install -g pnpm@10.28.0 --no-fund --no-audit
WORKDIR /repo
# Couche dépendances : ne se reconstruit que si les manifests changent
# Tous les manifests du workspace : sans eux, --frozen-lockfile refuse le lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/legacy/package.json ./apps/legacy/
COPY services/gateway/package.json ./services/gateway/
COPY services/identity/package.json ./services/identity/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/platform/package.json ./packages/platform/
COPY tools/firebase-export/package.json ./tools/firebase-export/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@vtt/${SERVICE}..." --ignore-scripts
COPY packages ./packages
COPY services/${SERVICE} ./services/${SERVICE}
# Build du service et de ses dépendances internes, dans l'ordre topologique
RUN pnpm --filter "@vtt/${SERVICE}..." run build
# Bundle autonome : seulement les dépendances de prod du service
RUN pnpm --filter "@vtt/${SERVICE}" deploy --prod --legacy /out

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
ARG SERVICE
ARG VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/theo-mrn/VTT-DD" \
      org.opencontainers.image.title="vtt-${SERVICE}" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production SERVICE_NAME=${SERVICE} SERVICE_VERSION=${VERSION} PORT=3000
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out ./
USER nonroot
EXPOSE 3000
# distroless : pas de shell, l'entrypoint est déjà node
CMD ["--enable-source-maps", "--import", "./dist/instrumentation.js", "dist/main.js"]
