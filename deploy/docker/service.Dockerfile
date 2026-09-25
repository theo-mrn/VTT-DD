# syntax=docker/dockerfile:1.7
# Image générique des services Node : docker build --build-arg SERVICE=gateway -f deploy/docker/service.Dockerfile .
ARG NODE_VERSION=22.12

FROM node:${NODE_VERSION}-bookworm-slim AS build
ARG SERVICE
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo
# Couche dépendances : ne se reconstruit que si les manifests changent
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY services/${SERVICE} ./services/${SERVICE}
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@vtt/${SERVICE}..." --ignore-scripts
RUN pnpm turbo run build --filter "@vtt/${SERVICE}..."
# Bundle autonome : seulement les dépendances de prod du service
RUN pnpm --filter "@vtt/${SERVICE}" deploy --prod --legacy /out

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
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
