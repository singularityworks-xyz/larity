import type { WorkerHealth } from "./worker";

export interface RegisteredWorker {
  close(): Promise<void>;
  getHealth(): Promise<WorkerHealth>;
}

interface WorkerConstructors {
  AudioCleanupWorker: new () => RegisteredWorker;
  ClientPersonaWorker: new () => RegisteredWorker;
  PreMeetingBriefWorker: new () => RegisteredWorker;
  SummaryWorker: new () => RegisteredWorker;
  TranscribeWorker: new () => RegisteredWorker;
}

export function createRegisteredWorkers(
  constructors: WorkerConstructors
): RegisteredWorker[] {
  return [
    new constructors.TranscribeWorker(),
    new constructors.SummaryWorker(),
    new constructors.AudioCleanupWorker(),
    new constructors.ClientPersonaWorker(),
    new constructors.PreMeetingBriefWorker(),
  ];
}
