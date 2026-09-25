# syntax=docker/dockerfile:1.7
# Front Next.js en mode standalone : docker build -f deploy/docker/web.Dockerfile .
ARG NODE_VERSION=22.12

FROM node:${NODE_VERSION}-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json ./apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@vtt/web..."
COPY apps/web ./apps/web
# Variables NEXT_PUBLIC_* : injectées au build (elles finissent dans le bundle client)
ARG NEXT_PUBLIC_APP_URL
RUN pnpm --filter @vtt/web build

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
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
