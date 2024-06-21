import { describe, expect, it } from "vitest";
import { Signal } from "../../src/wrapper";

describe("Effect", () => {
  it("should throw an error if you do not deref any signals", () => {
    expect(() => {
      new Signal.subtle.Effect(() => {}).execute();
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Effects must consume at least one Signal.]`
    );
  });

  it("should run the exec function whenever you call execute", () => {
    let numExecutes = 0;
    const signal = new Signal.State(1);
    const effect = new Signal.subtle.Effect(() => {
      signal.get();
      numExecutes++;
      return "hello " + numExecutes;
    });

    expect(effect.execute()).toBe("hello 1");
    expect(effect.execute()).toBe("hello 2");
    expect(effect.execute()).toBe("hello 3");
  });

  it("has a shouldExecute method that returns true if the effect has not been executed yet or if any of the signals have changed", () => {
    let numExecutes = 0;
    const signal = new Signal.State(1);
    const effect = new Signal.subtle.Effect(() => {
      signal.get();
      numExecutes++;
      return "hello " + numExecutes;
    });

    expect(effect.shouldExecute()).toBe(true);
    expect(effect.execute()).toBe("hello 1");
    expect(effect.shouldExecute()).toBe(false);
    expect(effect.execute()).toBe("hello 2");
    signal.set(2);
    expect(effect.shouldExecute()).toBe(true);
    expect(effect.execute()).toBe("hello 3");
    expect(effect.shouldExecute()).toBe(false);
  });

  it("should have sources", () => {
    const signal = new Signal.State(1);
    const effect = new Signal.subtle.Effect(() => {
      signal.get();
    });

    expect(Signal.subtle.introspectSources(effect)).toHaveLength(0);
    effect.execute();
    expect(Signal.subtle.introspectSources(effect)).toHaveLength(1);
  });

  it("should have sinks", () => {
    const signal = new Signal.State(1);
    const effect = new Signal.subtle.Effect(() => {
      signal.get();
    });
    const watcher = new Signal.subtle.Watcher(() => {});
    watcher.watch(effect);
    effect.execute();

    expect(Signal.subtle.introspectSinks(effect)).toHaveLength(1);
  });

  it("should allow reacting to changes in signals via Watcher", async () => {
    const signal = new Signal.State(1);
    let numExecutes = 0;
    const effect = new Signal.subtle.Effect(() => {
      numExecutes++;
      return "hello " + signal.get();
    });
    expect(effect.execute()).toBe("hello 1");
    const watcher = new Signal.subtle.Watcher(async () => {
      watcher.watch();
      await 0;
      if (effect.shouldExecute()) {
        effect.execute();
      }
    });

    watcher.watch(effect);

    expect(numExecutes).toBe(1);
    signal.set(2);
    await 0;
    expect(numExecutes).toBe(2);
    signal.set(3);
    await 0;
    expect(numExecutes).toBe(3);

    expect(effect.execute()).toBe("hello 3");
    expect(numExecutes).toBe(4);

    expect(effect.execute()).toBe("hello 3");
    expect(numExecutes).toBe(5);
  });
});
