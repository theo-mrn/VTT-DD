// Chargé via `node --import` avant tout autre module pour que l'instrumentation s'applique.
import { startTelemetryFromEnv } from '@vtt/platform/telemetry';

startTelemetryFromEnv();
