import {describe, expect, it} from 'vitest';
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

  it('should work to change a dependent signal in a computed', () => {
    const s = new Signal.State(0);
    const c = new Signal.Computed(() => {
      const value = s.get();
      if (value < 10) {
        s.set(value + 1);
      }
      return value;
    });
    const d = new Signal.Computed(() => {
      const value = s.get();
      if (value < 10) {
        s.set(value + 1);
      }
      return value;
    });
    expect(c.get()).toBe(10);
    expect(d.get()).toBe(10);
    expect(c.get()).toBe(10);
    expect(d.get()).toBe(10);
  });

  it('should not recompute when the dependent values go back to the ones used for last computation', () => {
    const s = new Signal.State(0);
    let n = 0;
    const c = new Signal.Computed(() => (n++, s.get()));
    expect(n).toBe(0);
    expect(c.get()).toBe(0);
    expect(n).toBe(1);
    s.set(1);
    expect(n).toBe(1);
    s.set(0);
    expect(n).toBe(1);
    expect(c.get()).toBe(0); // the last time c was computed was with s = 0, no need to recompute
    expect(n).toBe(1);
  });

  it('should not recompute when the dependent values go back to the ones used for last computation (with extra computed)', () => {
    const s = new Signal.State(0);
    let n = 0;
    const extra = new Signal.Computed(() => s.get());
    const c = new Signal.Computed(() => (n++, extra.get()));
    expect(n).toBe(0);
    expect(c.get()).toBe(0);
    expect(n).toBe(1);
    s.set(1);
    expect(n).toBe(1);
    s.set(0);
    expect(n).toBe(1);
    expect(c.get()).toBe(0); // the last time c was computed was with s = 0, no need to recompute
    expect(n).toBe(1);
  });
});
