import { S3Client } from "@aws-sdk/client-s3";
import { createComponentLogger, createRootLogger } from "@larity/logger";

export type { S3Client } from "@aws-sdk/client-s3";

// biome-ignore lint/performance/noBarrelFile: shared s3 entrypoint
export {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const log = createComponentLogger(
  createRootLogger({ service: "infra", level: process.env.LOG_LEVEL }),
  "s3"
);

export interface S3Config {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  region: string;
  secretAccessKey: string;
}

export function getS3Config(): S3Config {
  const isTest = process.env.NODE_ENV === "test";
  const endpoint = (
    process.env.S3_ENDPOINT ?? (isTest ? "http://localhost:9000" : "")
  ).trim();
  const region = (process.env.S3_REGION ?? "auto").trim();
  const accessKeyId = (
    process.env.S3_ACCESS_KEY_ID ?? (isTest ? "mock-access-key" : "")
  ).trim();
  const secretAccessKey = (
    process.env.S3_SECRET_ACCESS_KEY ?? (isTest ? "mock-secret-key" : "")
  ).trim();
  const bucket = (process.env.S3_AUDIO_BUCKET ?? "larity-audio").trim();

  const missing: string[] = [];
  if (!endpoint) {
    missing.push("S3_ENDPOINT");
  }
  if (!accessKeyId) {
    missing.push("S3_ACCESS_KEY_ID");
  }
  if (!secretAccessKey) {
    missing.push("S3_SECRET_ACCESS_KEY");
  }
  if (!bucket) {
    missing.push("S3_AUDIO_BUCKET");
  }

  const isDev = process.env.NODE_ENV !== "production";
  if (missing.length > 0) {
    if (isDev) {
      log.warn({ missing }, "S3 config incomplete — S3 features disabled");
    } else {
      throw new Error(`Missing S3 config: ${missing.join(" and ")}`);
    }
  }

  return {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
  };
}

export function createS3Client(config?: S3Config): S3Client {
  const cfg = config ?? getS3Config();
  log.info(
    { endpoint: cfg.endpoint, region: cfg.region, bucket: cfg.bucket },
    "Creating S3 client"
  );
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
  });
}
