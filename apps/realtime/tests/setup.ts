// Test environment setup
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.LOG_LEVEL = "fatal"; // Suppress all log output during tests
process.env.REALTIME_PORT = "9999"; // Use isolated port 9999 for testing

// Prevent AWS SDK from doing slow credential/metadata lookups
process.env.AWS_ACCESS_KEY_ID = "mock-access-key";
process.env.AWS_SECRET_ACCESS_KEY = "mock-secret-key";
process.env.S3_ENDPOINT = "http://localhost:9000";
process.env.S3_REGION = "us-east-1";
process.env.S3_ACCESS_KEY_ID = "mock-access-key";
process.env.S3_SECRET_ACCESS_KEY = "mock-secret-key";
process.env.S3_AUDIO_BUCKET = "larity-audio";
