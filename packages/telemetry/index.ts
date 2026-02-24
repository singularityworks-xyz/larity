import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { AmqplibInstrumentation } from "@opentelemetry/instrumentation-amqplib";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { Resource } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { PrismaInstrumentation } from "@prisma/instrumentation";

export function setupTelemetry(serviceName: string): NodeSDK {
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
  });

  const traceExporter = new OTLPTraceExporter({
    // If running in docker, point to otel-collector:4317
    // If running locally, point to localhost:4317
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
  });

  const metricExporter = new OTLPMetricExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10_000,
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      new IORedisInstrumentation(),
      new AmqplibInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    sdk
      .shutdown()
      .then(() => console.log(`${serviceName} Tracing terminated`))
      .catch((error) => console.log("Error terminating tracing", error))
      .finally(() => process.exit(0));
  });

  return sdk;
}
