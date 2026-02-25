import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { PrismaInstrumentation } from "@prisma/instrumentation";

export function setupTelemetry(serviceName: string): NodeSDK {
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "unknown",
    "deployment.environment": process.env.NODE_ENV || "development",
  });

  const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
  });

  const metricExporter = new OTLPMetricExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
  });

  const logExporter = new OTLPLogExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10_000,
  });

  const logRecordProcessor = new BatchLogRecordProcessor(
    // @ts-expect-error Version mismatch between exporter-logs-otlp-grpc and sdk-logs
    logExporter
  );

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    // @ts-expect-error Version mismatch between sdk-node and sdk-logs types
    logRecordProcessor,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable filesystem instrumentations if they create too much noise
        "@opentelemetry/instrumentation-fs": {
          enabled: false,
        },
      }),
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    sdk
      .shutdown()
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown shutdown error";
        process.stderr.write(
          `[telemetry] ${serviceName} shutdown failed: ${message}\n`
        );
      })
      .finally(() => process.exit(0));
  });

  return sdk;
}
