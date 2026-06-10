import { GoogleGenAI } from "@google/genai";
import { createWorkerLogger } from "../logger";

const log = createWorkerLogger("gemini");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

if (!GEMINI_API_KEY) {
  // We log a warning but don't crash immediately to allow health checks
  log.warn("WARNING: GEMINI_API_KEY is not set. LLM tasks will fail.");
}

export const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
