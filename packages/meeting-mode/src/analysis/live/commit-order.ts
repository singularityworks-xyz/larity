export class LiveCommitOrder {
  private readonly tails = new Map<string, Promise<void>>();

  begin(sessionId: string): { ready: Promise<void>; release: () => void } {
    const ready = this.tails.get(sessionId) ?? Promise.resolve();
    const { promise: finished, resolve } = Promise.withResolvers<void>();
    const tail = ready.then(() => finished);
    this.tails.set(sessionId, tail);

    return {
      ready,
      release: () => {
        resolve();
        if (this.tails.get(sessionId) === tail) {
          tail.then(() => {
            if (this.tails.get(sessionId) === tail) {
              this.tails.delete(sessionId);
            }
          });
        }
      },
    };
  }

  closeSession(sessionId: string): void {
    this.tails.delete(sessionId);
  }

  closeAll(): void {
    this.tails.clear();
  }
}
