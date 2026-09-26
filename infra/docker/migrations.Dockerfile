# syntax=docker/dockerfile:1.7
# Image de migration d'un service : ses changelogs Liquibase, rien d'autre.
#   docker build --build-arg SERVICE=identity -f infra/docker/migrations.Dockerfile .
# Lancée par le Job Helm « migrations » (hook Argo CD PreSync), avec le rôle
# <schéma>_owner : les pods du service n'ont jamais les droits DDL.
FROM liquibase/liquibase:4.33.0@sha256:e116c935ba22b59a22165207f65c268e363269de30bb1fedacff3755c2abaa8c
ARG SERVICE
ARG VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/theo-mrn/VTT-DD" \
      org.opencontainers.image.title="vtt-${SERVICE}-migrations" \
      org.opencontainers.image.version="${VERSION}"
COPY --chown=liquibase:liquibase backend/${SERVICE}/db /liquibase/changelog
USER liquibase
ENTRYPOINT ["liquibase", "--search-path=/liquibase/changelog", "--changelog-file=changelog.yaml"]
CMD ["update"]
