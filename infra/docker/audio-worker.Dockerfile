# syntax=docker/dockerfile:1.7
# Worker audio (analyse ffmpeg, purge) : même paquet que le service audio, entrée dist/worker.js.
#   docker build -f infra/docker/audio-worker.Dockerfile .
# L'image distroless des services n'a pas ffmpeg : runtime Debian slim avec ffmpeg épinglé
# (version majeure du dépôt Debian), utilisateur non root, racine en lecture seule côté k8s
# (/tmp en emptyDir de 1 Gio, cf. infra/gitops/*/audio-worker.yaml).
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-trixie-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN npm install -g pnpm@10.28.0 --no-fund --no-audit
WORKDIR /repo
# Tous les manifests du workspace : sans eux, --frozen-lockfile refuse le lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
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
COPY packages/platform/package.json ./packages/platform/
COPY packages/rules/package.json ./packages/rules/
COPY packages/systemes/package.json ./packages/systemes/
COPY tools/firebase-export/package.json ./tools/firebase-export/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@vtt/audio..." --ignore-scripts
COPY packages ./packages
COPY backend/audio ./backend/audio
RUN pnpm --filter "@vtt/audio..." run build
RUN pnpm --filter "@vtt/audio" deploy --prod --legacy /out

FROM node:${NODE_VERSION}-trixie-slim AS runtime
ARG VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/theo-mrn/VTT-DD" \
      org.opencontainers.image.title="vtt-audio-worker" \
      org.opencontainers.image.version="${VERSION}"
# ffmpeg 7.1 (Debian trixie) : ffprobe, ebur128, encodeur AAC natif
RUN apt-get update \
 && apt-get install -y --no-install-recommends 'ffmpeg=7:7.1.*' \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production SERVICE_NAME=audio-worker SERVICE_VERSION=${VERSION} \
    WORKER_PORT=3000 FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe WORKER_TMP_DIR=/tmp
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "--import", "./dist/instrumentation.js", "dist/worker.js"]
