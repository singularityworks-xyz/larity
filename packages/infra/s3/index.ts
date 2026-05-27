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
  return {
    endpoint: process.env.S3_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.S3_AUDIO_BUCKET ?? "larity-audio",
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
