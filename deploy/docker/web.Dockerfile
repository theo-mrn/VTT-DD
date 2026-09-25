# syntax=docker/dockerfile:1.7
# Front Next.js en mode standalone : docker build -f deploy/docker/web.Dockerfile .
ARG NODE_VERSION=22.12

FROM node:${NODE_VERSION}-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY services/gateway/package.json ./services/gateway/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/platform/package.json ./packages/platform/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@vtt/web..."
COPY apps/web ./apps/web
COPY deploy/ci/build-placeholders.env /tmp/build.env
# NEXT_PUBLIC_* : figées dans le bundle client au build ; en release elles viennent
# des variables du dépôt (build-args). Les secrets serveur restent factices ici
# et sont fournis à l'exécution par les Secrets Kubernetes.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_DATABASE_URL
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
# Valeur factice seulement pour les variables non fournies en build-arg
RUN while IFS='=' read -r k v; do \
      case "$k" in ''|\#*) continue ;; esac; \
      eval "[ -n \"\${$k:-}\" ]" || export "$k=$v"; \
    done < /tmp/build.env \
    && pnpm --filter @vtt/web build

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
