export interface ChunkableUtterance {
  timestamp: number; // in seconds
}

export function chunkUtterances<T extends ChunkableUtterance>(
  utterances: T[],
  windowSizeSec = 900,
  overlapSec = 120
): T[][] {
  if (utterances.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  const startTs = utterances[0]?.timestamp ?? 0;
  const endTs = utterances.at(-1)?.timestamp ?? 0;

  let currentStart = startTs;

  while (currentStart <= endTs) {
    const currentEnd = currentStart + windowSizeSec;
    const chunk = utterances.filter(
      (u) => u.timestamp >= currentStart && u.timestamp < currentEnd
    );

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    currentStart = currentEnd - overlapSec;

    if (windowSizeSec <= overlapSec) {
      break;
    }
  }

  return chunks;
}
