import { expect, test } from "bun:test";
import { REGISTERED_WORKER_QUEUE_NAMES } from "@larity/jobs/meeting-handoffs";
import {
  createRegisteredWorkers,
  type RegisteredWorker,
} from "./runtime/registry";

function workerConstructor(name: string): new () => RegisteredWorker {
  return class FakeWorker implements RegisteredWorker {
    close(): Promise<void> {
      return Promise.resolve();
    }

    getHealth() {
      return Promise.resolve({ active: true, name, uptimeMs: 0 });
    }
  };
}

test("worker startup registers each queue handler once", async () => {
  const workers = createRegisteredWorkers({
    TranscribeWorker: workerConstructor(REGISTERED_WORKER_QUEUE_NAMES[0]),
    SummaryWorker: workerConstructor(REGISTERED_WORKER_QUEUE_NAMES[1]),
    AudioCleanupWorker: workerConstructor(REGISTERED_WORKER_QUEUE_NAMES[2]),
    ClientPersonaWorker: workerConstructor(REGISTERED_WORKER_QUEUE_NAMES[3]),
    PreMeetingBriefWorker: workerConstructor(REGISTERED_WORKER_QUEUE_NAMES[4]),
  });
  const names = await Promise.all(
    workers.map(async (worker) => (await worker.getHealth()).name)
  );

  expect(names).toEqual([...REGISTERED_WORKER_QUEUE_NAMES]);
  expect(new Set(names).size).toBe(5);
});
