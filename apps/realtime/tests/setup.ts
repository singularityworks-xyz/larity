// Test environment setup
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.LOG_LEVEL = "fatal"; // Suppress all log output during tests
