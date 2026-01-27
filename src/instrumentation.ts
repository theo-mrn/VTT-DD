
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { NodeSDK } = await import('@opentelemetry/sdk-node');
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
        const { resourceFromAttributes, defaultResource } = await import('@opentelemetry/resources');
        const {
            SEMRESATTRS_SERVICE_NAME,
            SEMRESATTRS_SERVICE_NAMESPACE,
            SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
        } = await import('@opentelemetry/semantic-conventions');
        const { HttpInstrumentation } = await import('@opentelemetry/instrumentation-http');

        // Disable metrics to avoid 404 errors on trace endpoint
        process.env.OTEL_METRICS_EXPORTER = 'none';

        const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'https://otlp-gateway-prod-us-east-0.grafana.net/otlp/v1/traces';
        const serviceName = process.env.OTEL_SERVICE_NAME || 'vtt-dd-app';

        const exporter = new OTLPTraceExporter({
            url: endpoint,
            headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
                ? parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS)
                : {},
        });

        const resource = defaultResource().merge(
            resourceFromAttributes({
                [SEMRESATTRS_SERVICE_NAME]: serviceName,
                [SEMRESATTRS_SERVICE_NAMESPACE]: process.env.OTEL_SERVICE_NAMESPACE || 'vtt-dd',
                [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.OTEL_DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'development',
            })
        );

        const sdk = new NodeSDK({
            resource: resource,
            traceExporter: exporter,
            instrumentations: [new HttpInstrumentation()],
        });

        try {
            sdk.start();
            console.log(`OpenTelemetry SDK started successfully. Service: ${serviceName}, Endpoint: ${endpoint}`);
        } catch (error) {
            console.error('Error starting OpenTelemetry SDK:', error);
        }

    }
}

// Helper to parse headers string "key=value,key2=value2" into object
function parseHeaders(headerStr: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!headerStr) return headers;

    headerStr.split(',').forEach(pair => {
        const firstEquals = pair.indexOf('=');
        if (firstEquals > 0) {
            const key = pair.substring(0, firstEquals).trim();
            const value = pair.substring(firstEquals + 1).trim();
            headers[key] = value;
        }
    });
    return headers;
}
