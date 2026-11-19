import { beforeEach, describe, expect, test } from "bun:test";
import {
  __test_only_resetSubscriptions as resetSubscriptions,
  type SubscriptionClient,
  sessionChannels,
  sessionPatterns,
  __test_only_setSubscriptionClient as setSubscriptionClient,
  subscribeSession,
  unsubscribeSession,
} from "./subscriber";

function makeClient(): SubscriptionClient & {
  calls: { kind: string; targets: string[] }[];
} {
  const calls: { kind: string; targets: string[] }[] = [];
  return {
    calls,
    psubscribe: (...patterns: string[]) => {
      calls.push({ kind: "psubscribe", targets: patterns });
      return Promise.resolve(1);
    },
    punsubscribe: (...patterns: unknown[]) => {
      calls.push({
        kind: "punsubscribe",
        targets: patterns.map(String),
      });
      return Promise.resolve(1);
    },
    subscribe: (...channels: string[]) => {
      calls.push({ kind: "subscribe", targets: channels });
      return Promise.resolve(1);
    },
    unsubscribe: (...channels: unknown[]) => {
      calls.push({
        kind: "unsubscribe",
        targets: channels.map(String),
      });
      return Promise.resolve(1);
    },
  };
}

describe("per-session subscriptions (P5.2)", () => {
  beforeEach(() => {
    resetSubscriptions();
  });

  test("sessionChannels covers every former global pattern + legacy STT", () => {
    const channels = sessionChannels("s1");
    expect(channels).toEqual([
      "meeting.utterance.s1",
      "meeting.topic.s1",
      "meeting.alert.s1.shared",
      "meeting.ledger.s1",
      "meeting.pipeline.s1",
      "meeting.stt.final.s1",
      "meeting.stt.partial.s1",
      "meeting.stt.s1",
      "meeting.processed.s1",
      "meeting.speaker_identity_guessed.s1",
      "meeting.system_event.s1",
    ]);
    expect(sessionPatterns("s1")).toEqual(["meeting.alert.s1.user.*"]);
  });

  test("subscribe is idempotent per session", async () => {
    const client = makeClient();
    setSubscriptionClient(client);

    await subscribeSession("s1");
    await subscribeSession("s1");
    await subscribeSession("s2");

    const subscribes = client.calls.filter((c) => c.kind === "subscribe");
    expect(subscribes).toHaveLength(2);
    expect(subscribes[0]?.targets).toHaveLength(11);
    const psubscribes = client.calls.filter((c) => c.kind === "psubscribe");
    expect(psubscribes).toHaveLength(2);
    expect(psubscribes[0]?.targets).toEqual(["meeting.alert.s1.user.*"]);
  });

  test("unsubscribe leaves the session and ignores unknowns", async () => {
    const client = makeClient();
    setSubscriptionClient(client);

    await subscribeSession("s1");
    await unsubscribeSession("s1");
    await unsubscribeSession("s1");
    await unsubscribeSession("never-subscribed");

    const unsubscribes = client.calls.filter((c) => c.kind === "unsubscribe");
    expect(unsubscribes).toHaveLength(1);
    expect(unsubscribes[0]?.targets).toHaveLength(11);
    const punsubscribes = client.calls.filter((c) => c.kind === "punsubscribe");
    expect(punsubscribes).toHaveLength(1);
    expect(punsubscribes[0]?.targets).toEqual(["meeting.alert.s1.user.*"]);
  });

  test("no client means no-op (server start order guard)", async () => {
    setSubscriptionClient(null);
    // Must not throw; nothing is marked subscribed.
    await subscribeSession("s1");
    await unsubscribeSession("s1");

    const client = makeClient();
    setSubscriptionClient(client);
    // Still unsubscribed after the earlier no-op subscribe.
    await unsubscribeSession("s1");
    expect(client.calls).toHaveLength(0);
  });

  test("a close during an in-flight subscribe still unsubscribes", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: { kind: string; targets: string[] }[] = [];
    const client: SubscriptionClient = {
      psubscribe: (...patterns: string[]) => {
        calls.push({ kind: "psubscribe", targets: patterns });
        return Promise.resolve(1);
      },
      punsubscribe: (...patterns: unknown[]) => {
        calls.push({ kind: "punsubscribe", targets: patterns.map(String) });
        return Promise.resolve(1);
      },
      subscribe: (...channels: string[]) => {
        calls.push({ kind: "subscribe", targets: channels });
        return gate.then(() => 1);
      },
      unsubscribe: (...channels: unknown[]) => {
        calls.push({ kind: "unsubscribe", targets: channels.map(String) });
        return Promise.resolve(1);
      },
    };
    setSubscriptionClient(client);

    const subscribing = subscribeSession("s1");
    // Let the subscribe op begin and block inside the Redis subscribe call.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const unsubscribing = unsubscribeSession("s1");
    release();
    await Promise.all([subscribing, unsubscribing]);

    expect(calls.filter((c) => c.kind === "subscribe")).toHaveLength(1);
    expect(calls.filter((c) => c.kind === "unsubscribe")).toHaveLength(1);
    expect(calls.filter((c) => c.kind === "psubscribe")).toHaveLength(1);
    expect(calls.filter((c) => c.kind === "punsubscribe")).toHaveLength(1);
  });

  test("a failed psubscribe rolls back and does not track the session", async () => {
    const calls: { kind: string; targets: string[] }[] = [];
    const client: SubscriptionClient = {
      subscribe: (...channels: string[]) => {
        calls.push({ kind: "subscribe", targets: channels });
        return Promise.resolve(1);
      },
      unsubscribe: (...channels: unknown[]) => {
        calls.push({ kind: "unsubscribe", targets: channels.map(String) });
        return Promise.resolve(1);
      },
      psubscribe: () => Promise.reject(new Error("boom")),
      punsubscribe: (...patterns: unknown[]) => {
        calls.push({ kind: "punsubscribe", targets: patterns.map(String) });
        return Promise.resolve(1);
      },
    };
    setSubscriptionClient(client);

    await subscribeSession("s1");
    expect(calls.filter((c) => c.kind === "subscribe")).toHaveLength(1);
    expect(calls.filter((c) => c.kind === "unsubscribe")).toHaveLength(1);

    // State says not subscribed, so a later unsubscribe is a no-op.
    await unsubscribeSession("s1");
    expect(calls.filter((c) => c.kind === "unsubscribe")).toHaveLength(1);
    expect(calls.filter((c) => c.kind === "punsubscribe")).toHaveLength(0);
  });

  test("two sessions stay independent", async () => {
    const client = makeClient();
    setSubscriptionClient(client);

    await subscribeSession("s1");
    await subscribeSession("s2");
    await unsubscribeSession("s1");

    // s2 remains subscribed: unsubscribing it still issues commands.
    await unsubscribeSession("s2");
    expect(client.calls.filter((c) => c.kind === "unsubscribe")).toHaveLength(
      2
    );
  });
});
