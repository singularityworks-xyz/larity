import { describe, expect, it } from "bun:test";
import { chunkUtterances } from "../src/lib/chunking";

describe("Transcript Chunking", () => {
  it("should return empty array for empty inputs", () => {
    expect(chunkUtterances([])).toEqual([]);
  });

  it("should split utterances into single window if total duration is within size limit", () => {
    const utterances = [
      { timestamp: 0 },
      { timestamp: 100 },
      { timestamp: 500 },
    ];
    // Window is 900s, all fall in [0, 900)
    const result = chunkUtterances(utterances, 900, 120);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3);
  });

  it("should split into multiple windows with correct overlap contents", () => {
    const utterances = [
      { timestamp: 0 },
      { timestamp: 700 },
      { timestamp: 800 }, // falls inside [0, 900) and overlap starts at 780, so it's in overlap [780, 900)
      { timestamp: 950 }, // falls inside second window [780, 1680)
    ];

    // Window size: 900s, Overlap: 120s
    // Window 1: [0, 900) -> contains {0}, {700}, {800}
    // Window 2: [780, 1680) -> contains {800}, {950}
    const result = chunkUtterances(utterances, 900, 120);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(3);
    expect(result[0]?.map((u) => u.timestamp)).toEqual([0, 700, 800]);

    expect(result[1]).toHaveLength(2);
    expect(result[1]?.map((u) => u.timestamp)).toEqual([800, 950]);
  });

  it("should gracefully handle large gaps and prevent infinite loops", () => {
    const utterances = [{ timestamp: 0 }, { timestamp: 3000 }];

    // Window size: 900s, Overlap: 120s
    // Loop increments window by 780s each time
    const result = chunkUtterances(utterances, 900, 120);

    // Gaps in between might result in empty chunks which are filtered out.
    // Window [0, 900) -> contains {0}
    // Window [780, 1680) -> empty (filtered)
    // Window [1560, 2460) -> empty (filtered)
    // Window [2340, 3240) -> contains {3000}
    expect(result).toHaveLength(2);
    expect(result[0]?.map((u) => u.timestamp)).toEqual([0]);
    expect(result[1]?.map((u) => u.timestamp)).toEqual([3000]);
  });
});
