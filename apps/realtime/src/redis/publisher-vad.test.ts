import { describe, expect, test } from "bun:test";
import type { VadSignal } from "../types";
import {
  publishVadSignal,
  type VadRedisClient,
  type VadRedisMulti,
} from "./publisher";

function makeSignal(): VadSignal {
  return {
    clientSendTs: 1000,
    serverReceiveTs: 1010,
    sessionId: "s1",
    type: "vad_speaking",
    userId: "u1",
  };
}

interface FakeMulti extends VadRedisMulti {
  commands: string[];
  listLen: number;
}

function makeClient(listLens: number[]): VadRedisClient & {
  commands: string[];
  expires: string[];
} {
  const commands: string[] = [];
  const expires: string[] = [];
  let execCount = 0;
  const multi: FakeMulti = {
    commands,
    listLen: 0,
    exec: () => {
      const len = listLens[execCount] ?? 99;
      execCount += 1;
      multi.listLen = len;
      return Promise.resolve([
        [null, 1],
        [null, len],
      ]);
    },
    publish: (channel: string) => {
      commands.push(`publish:${channel}`);
      return multi;
    },
    rpush: (key: string) => {
      commands.push(`rpush:${key}`);
      return multi;
    },
  };
  return {
    commands,
    expires,
    expire: (key: string) => {
      expires.push(key);
      return Promise.resolve(1);
    },
    multi: () => multi,
  };
}

describe("publishVadSignal MULTI (P5.4)", () => {
  test("first push expires the history key exactly once", async () => {
    const client = makeClient([1]);
    await publishVadSignal(makeSignal(), client);

    expect(client.commands).toEqual([
      "publish:realtime.vad.s1",
      "rpush:meeting.vad.s1",
    ]);
    expect(client.expires).toEqual(["meeting.vad.s1"]);
  });

  test("later pushes skip EXPIRE", async () => {
    const client = makeClient([5]);
    await publishVadSignal(makeSignal(), client);

    expect(client.commands).toEqual([
      "publish:realtime.vad.s1",
      "rpush:meeting.vad.s1",
    ]);
    expect(client.expires).toEqual([]);
  });

  test("redis errors never reject", async () => {
    const failing: VadRedisClient = {
      expire: () => Promise.reject(new Error("down")),
      multi: () => {
        throw new Error("down");
      },
    };
    await expect(
      publishVadSignal(makeSignal(), failing)
    ).resolves.toBeUndefined();
  });
});
