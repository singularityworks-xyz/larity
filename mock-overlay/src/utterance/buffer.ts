import type { SttResult } from "../../../stt/src/types";
import { MAX_BUFFER_SIZE } from "../env";
import { createMeetingModeLogger } from "../logger";
import type { FinalizeResult } from "./types";

const log = createMeetingModeLogger("partial-buffer");

export class PartialBuffer {
  private partials: SttResult[] = [];

  private lastUpdate: number = Date.now();

  append(result: SttResult): void {
    this.lastUpdate = Date.now();
    this.partials.push(result);

    if (this.partials.length > MAX_BUFFER_SIZE) {
      const overflow = this.partials.length - MAX_BUFFER_SIZE;
      this.partials.splice(0, overflow);

      log.warn(
        { overflow, maxSize: MAX_BUFFER_SIZE },
        "Buffer overflow: removed oldest entries"
      );
    }
  }
  finalize(finalResult: SttResult): FinalizeResult {
    this.lastUpdate = Date.now();

    const result: FinalizeResult = {
      text: finalResult.transcript,
      confidence: finalResult.confidence,
      duration: finalResult.duration,
      startOffset: finalResult.start,
      timestamp: finalResult.ts,
    };

    this.clear();
    return result;
  }
  clear(): void {
    this.partials = [];
    this.lastUpdate = Date.now();
  }
  getLastUpdate(): number {
    return this.lastUpdate;
  }
  getPartialCount(): number {
    return this.partials.length;
  }
}
