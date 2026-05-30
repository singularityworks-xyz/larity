import { S3Client } from "@aws-sdk/client-s3";

// biome-ignore lint/performance/noBarrelFile: shared s3 entrypoint
export {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function getS3Config(): S3Config {
  const endpoint = (process.env.S3_ENDPOINT ?? "").trim();
  const region = (process.env.S3_REGION ?? "auto").trim();
  const accessKeyId = (process.env.S3_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (process.env.S3_SECRET_ACCESS_KEY ?? "").trim();
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

  if (missing.length > 0) {
    throw new Error(`Missing S3 config: ${missing.join(" and ")}`);
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
