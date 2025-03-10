import {describe, expect, it} from 'vitest';
import {Signal} from '../../src/wrapper.js';

describe('Performance', () => {
  it('per-item unwatch is fast', () => {
    const amountOfSignals = 10000;
    const unwatchToWatchSlownessRatio = 35;
    const w = new Signal.subtle.Watcher(() => {});
    const signals = Array.from({length: amountOfSignals}, () => new Signal.State(1));
    const watchStart = performance.now();
    signals.forEach((s) => w.watch(s));
    const watchEnd = performance.now();
    const unwatchStart = performance.now();
    signals.forEach((s) => w.unwatch(s));
    const unwatchEnd = performance.now();
    const watchTime = watchEnd - watchStart;
    const unwatchTime = unwatchEnd - unwatchStart;

    // we assume that unwatch can't be N times slower than watch
    expect(unwatchTime).toBeLessThan(watchTime * unwatchToWatchSlownessRatio);
  });
  it('batch unwatch is fast', () => {
    const amountOfSignals = 10000;
    const unwatchToWatchSlownessRatio = 4;
    const w = new Signal.subtle.Watcher(() => {});
    const signals = Array.from({length: amountOfSignals}, () => new Signal.State(1));
    const watchStart = performance.now();
    signals.forEach((s) => w.watch(s));
    const watchEnd = performance.now();
    const unwatchStart = performance.now();
    w.unwatch(...signals);
    const unwatchEnd = performance.now();
    const watchTime = watchEnd - watchStart;
    const unwatchTime = unwatchEnd - unwatchStart;

    expect(unwatchTime).toBeLessThan(watchTime * unwatchToWatchSlownessRatio);
  });
});
