import {describe, it, expect, vi} from 'vitest';
import {Signal} from '../../../src';

describe('Ported - Vue', () => {
  // https://github.com/vuejs/core/blob/main/packages/reactivity/__tests__/computed.spec.ts#L32
  it('should return updated value', () => {
    const s = new Signal.State<{foo?: number}>({});
    const c = new Signal.Computed(() => s.get().foo);

    expect(c.get()).toBe(undefined);
    s.set({foo: 1});
    expect(c.get()).toBe(1);
  });

  // https://github.com/vuejs/core/blob/main/packages/reactivity/__tests__/computed.spec.ts#L54
  it('should compute lazily', () => {
    const s = new Signal.State<{foo?: number}>({});
    const getter = vi.fn(() => s.get().foo);
    const c = new Signal.Computed(getter);

    // lazy
    expect(getter).not.toHaveBeenCalled();

    expect(c.get()).toBe(undefined);
    expect(getter).toHaveBeenCalledTimes(1);

    // should not compute again
    c.get();
    expect(getter).toHaveBeenCalledTimes(1);

    // should not compute until needed
    s.set({foo: 1});
    expect(getter).toHaveBeenCalledTimes(1);

    // now it should compute
    expect(c.get()).toBe(1);
    expect(getter).toHaveBeenCalledTimes(2);

    // should not compute again
    c.get();
    expect(getter).toHaveBeenCalledTimes(2);
  });

  // https://github.com/vuejs/core/blob/main/packages/reactivity/__tests__/computed.spec.ts#L488
  it('should work when chained(ref+computed)', () => {
    const v = new Signal.State(0);
    const c1 = new Signal.Computed(() => {
      if (v.get() === 0) {
        v.set(1);
      }
      return 'foo';
    });
    const c2 = new Signal.Computed(() => v.get() + c1.get());
    expect(c2.get()).toBe('0foo');
    expect(c2.get()).toBe('0foo'); // ! In vue it recomputes and becomes '1foo'
  });

  // https://github.com/vuejs/core/blob/main/packages/reactivity/__tests__/computed.spec.ts#L925
  it('should be recomputed without being affected by side effects', () => {
    const v = new Signal.State(0);
    const c1 = new Signal.Computed(() => {
      v.set(1);
      return 0;
    });
    const c2 = new Signal.Computed(() => {
      return v.get() + ',' + c1.get();
    });

    expect(c2.get()).toBe('0,0');
    v.set(1);
    expect(c2.get()).toBe('0,0'); // ! In vue it recomputes and becomes '1,0'
  });
});
