export class ClockOffsetTracker {
  private readonly samples = new Map<string, number[]>();
  private readonly windowSize = 30;
  private untrustedUntil = 0;
  private readonly lastMedianOffset = new Map<string, number>();

  addSample(
    userId: string,
    clientSendTs: number,
    serverReceiveTs: number
  ): void {
    const halfRTT = 50; // Approximated
    const offset = serverReceiveTs - clientSendTs - halfRTT;

    let userSamples = this.samples.get(userId);
    if (!userSamples) {
      userSamples = [];
      this.samples.set(userId, userSamples);
    }

    userSamples.push(offset);
    if (userSamples.length > this.windowSize) {
      userSamples.shift();
    }

    const previousMedian = this.lastMedianOffset.get(userId);
    const currentMedian = this.calculateMedian(userSamples);
    this.lastMedianOffset.set(userId, currentMedian);

    // Detect large shifts > 500ms
    if (
      previousMedian !== undefined &&
      Math.abs(currentMedian - previousMedian) > 500
    ) {
      // Mark as untrusted for 2 seconds
      this.untrustedUntil = Date.now() + 2000;
    }
  }

  getMedianOffset(userId: string): number {
    return this.lastMedianOffset.get(userId) ?? 0;
  }

  isUntrusted(): boolean {
    return Date.now() < this.untrustedUntil;
  }

  // for testing purposes
  fastForwardTime(now: number): void {
    if (now >= this.untrustedUntil) {
      this.untrustedUntil = 0;
    }
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
    }
    return sorted[mid] ?? 0;
  }
}
