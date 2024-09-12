import {describe, expect, it, vi} from 'vitest';
import {Signal} from '../../src/wrapper.js';

describe('Computed', () => {
  it('should work', () => {
    const stateSignal = new Signal.State(1);

    const computedSignal = new Signal.Computed(() => {
      const f = stateSignal.get() * 2;
      return f;
    });

    expect(computedSignal.get()).toEqual(2);

    stateSignal.set(5);

    expect(stateSignal.get()).toEqual(5);
    expect(computedSignal.get()).toEqual(10);
  });

  it('does not cache volatile sources', () => {
    let count = 0;
    const volatileSignal = new Signal.Volatile(() => count++);
    const computedSignal = new Signal.Computed(() => volatileSignal.get());

    // Since the volatile source can change at any time we can't cache the
    // dependency value.
    expect(computedSignal.get()).toBe(0);
    expect(computedSignal.get()).toBe(1);
  });

  it('still caches equal outputs when depending on volatile sources', () => {
    const volatileSignal = new Signal.Volatile(() => null);
    const computeFn = vi.fn(() => {
      volatileSignal.get();
      return Symbol('This symbol should be cached');
    });

    const computedSignal = new Signal.Computed(computeFn, {equals: () => true});

    // Forcing the computed to re-evaluate should not break our ability to
    // cache the output if `equals` indicates it's the same.
    expect(computedSignal.get()).toBe(computedSignal.get());
    expect(computeFn).toHaveBeenCalledTimes(2);
  });

  it('can become non-volatile again if the volatile sources are removed', () => {
    const branchSignal = new Signal.State(true);
    const volatileSignal = new Signal.Volatile(() => null);
    const computeFn = vi.fn(() => {
      if (branchSignal.get()) {
        volatileSignal.get();
      }
    });

    const computedSignal = new Signal.Computed(computeFn);

    // Depends on volatile sources.
    computedSignal.get();
    computedSignal.get();
    expect(computeFn).toHaveBeenCalledTimes(2);

    // Volatile source removed.
    branchSignal.set(false);
    computedSignal.get();
    computedSignal.get();
    expect(computeFn).toHaveBeenCalledTimes(3);
  });

  describe('Comparison semantics', () => {
    it('should track Computed by Object.is', () => {
      const state = new Signal.State(1);
      let value = 5;
      let calls = 0;
      const computed = new Signal.Computed(() => (state.get(), value));
      const c2 = new Signal.Computed(() => (calls++, computed.get()));

      expect(calls).toBe(0);
      expect(c2.get()).toBe(5);
      expect(calls).toBe(1);
      state.set(2);
      expect(c2.get()).toBe(5);
      expect(calls).toBe(1);
      value = NaN;
      expect(c2.get()).toBe(5);
      expect(calls).toBe(1);
      state.set(3);
      expect(c2.get()).toBe(NaN);
      expect(calls).toBe(2);
      state.set(4);
      expect(c2.get()).toBe(NaN);
      expect(calls).toBe(2);
    });

    it('applies custom equality in Computed', () => {
      const s = new Signal.State(5);
      let ecalls = 0;
      const c1 = new Signal.Computed(() => (s.get(), 1), {
        equals() {
          ecalls++;
          return false;
        },
      });
      let calls = 0;
      const c2 = new Signal.Computed(() => {
        calls++;
        return c1.get();
      });

      expect(calls).toBe(0);
      expect(ecalls).toBe(0);

      expect(c2.get()).toBe(1);
      expect(ecalls).toBe(0);
      expect(calls).toBe(1);

      s.set(10);
      expect(c2.get()).toBe(1);
      expect(ecalls).toBe(1);
      expect(calls).toBe(2);
    });
  });
});
