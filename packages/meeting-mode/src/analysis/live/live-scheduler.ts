interface Job {
  run: () => Promise<void>;
}

interface SessionQueue {
  active: number;
  idle: Array<() => void>;
  pending: Job[];
}

export class LiveEvaluationScheduler {
  private readonly sessions = new Map<string, SessionQueue>();

  private readonly concurrency: number;

  constructor(concurrency: number) {
    this.concurrency = Math.max(1, Math.floor(concurrency));
  }

  enqueue(sessionId: string, run: () => Promise<void>): void {
    let queue = this.sessions.get(sessionId);
    if (!queue) {
      queue = { active: 0, pending: [], idle: [] };
      this.sessions.set(sessionId, queue);
    }
    queue.pending.push({ run });
    this.pump(sessionId, queue);
  }

  waitForIdle(sessionId: string): Promise<void> {
    const queue = this.sessions.get(sessionId);
    return queue && (queue.active || queue.pending.length)
      ? new Promise((resolve) => queue.idle.push(resolve))
      : Promise.resolve();
  }

  closeSession(sessionId: string): void {
    const queue = this.sessions.get(sessionId);
    if (queue) {
      queue.pending.length = 0;
      this.sessions.delete(sessionId);
      if (!queue.active) {
        for (const resolve of queue.idle) {
          resolve();
        }
      }
    }
  }

  closeAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
  }

  private pump(sessionId: string, queue: SessionQueue): void {
    while (
      this.sessions.get(sessionId) === queue &&
      queue.active < this.concurrency &&
      queue.pending.length
    ) {
      const job = queue.pending.shift();
      if (!job) {
        break;
      }
      queue.active += 1;
      Promise.resolve()
        .then(() => {
          if (this.sessions.get(sessionId) === queue) {
            return job.run();
          }
        })
        .catch(() => undefined)
        .finally(() => {
          queue.active -= 1;
          this.pump(sessionId, queue);
          if (!(queue.active || queue.pending.length)) {
            for (const resolve of queue.idle.splice(0)) {
              resolve();
            }
            if (this.sessions.get(sessionId) === queue) {
              this.sessions.delete(sessionId);
            }
          }
        });
    }
  }
}
