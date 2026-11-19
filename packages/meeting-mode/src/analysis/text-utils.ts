const WHITESPACE_REGEX = /\s+/g;
const PUNCTUATION_TRIM_REGEX = /^[^a-z0-9]+|[^a-z0-9]+$/gi;

export function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(WHITESPACE_REGEX, " ").trim();
}

export function normalizeAlphaNumeric(text: string): string {
  return normalizeForComparison(text)
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

export function tokenize(text: string): string[] {
  const normalized = normalizeAlphaNumeric(text);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .map((token) => token.replace(PUNCTUATION_TRIM_REGEX, ""))
    .filter((token) => token.length > 0);
}

export function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previousRow = new Array(right.length + 1)
    .fill(0)
    .map((_, index) => index);
  const currentRow = new Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i++) {
    currentRow[0] = i;

    for (let j = 1; j <= right.length; j++) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        (previousRow[j] as number) + 1,
        (currentRow[j - 1] as number) + 1,
        (previousRow[j - 1] as number) + substitutionCost
      );
    }

    for (let j = 0; j <= right.length; j++) {
      previousRow[j] = currentRow[j];
    }
  }

  return previousRow[right.length] ?? Math.max(left.length, right.length);
}

export function isNearTextMatch(
  left: string,
  right: string,
  threshold = 0.2
): boolean {
  const normalizedLeft = normalizeAlphaNumeric(left);
  const normalizedRight = normalizeAlphaNumeric(right);

  if (!normalizedLeft) {
    return false;
  }

  if (!normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  const length = Math.max(normalizedLeft.length, normalizedRight.length);
  if (length === 0) {
    return false;
  }

  return distance / length <= threshold;
}

export function extractSlidingWindows(
  sourceTokens: string[],
  windowSize: number
): string[] {
  if (windowSize <= 0 || sourceTokens.length < windowSize) {
    return [];
  }

  const windows: string[] = [];
  for (let index = 0; index <= sourceTokens.length - windowSize; index++) {
    windows.push(sourceTokens.slice(index, index + windowSize).join(" "));
  }
  return windows;
}
