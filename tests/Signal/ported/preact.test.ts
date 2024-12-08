import {describe, it, expect, vi} from 'vitest';
import {Signal} from '../../../src';

describe('Ported - Preact', () => {
  // https://github.com/preactjs/signals/blob/main/packages/core/test/signal.test.tsx#L1078
  it('should not leak errors raised by dependencies', () => {
    const a = new Signal.State(0);
    const b = new Signal.Computed(() => {
      a.get();
      throw new Error('error');
    });
    const c = new Signal.Computed(() => {
      try {
        b.get();
      } catch {
        return 'ok';
      }
    });
    expect(c.get()).to.equal('ok');
    a.set(1);
    expect(c.get()).to.equal('ok');
  });

  // https://github.com/preactjs/signals/blob/main/packages/core/test/signal.test.tsx#L914
  it('should return updated value', () => {
    const a = new Signal.State('a');
    const b = new Signal.State('b');

    const c = new Signal.Computed(() => a.get() + b.get());
    expect(c.get()).to.equal('ab');

    a.set('aa');
    expect(c.get()).to.equal('aab');
  });

  // https://github.com/preactjs/signals/blob/main/packages/core/test/signal.test.tsx#L925
  it('should be lazily computed on demand', () => {
    const a = new Signal.State('a');
    const b = new Signal.State('b');
    const spy = vi.fn(() => a.get() + b.get());
    const c = new Signal.Computed(spy);
    expect(spy).not.toHaveBeenCalled();
    c.get();
    expect(spy).toHaveBeenCalledOnce();
    a.set('x');
    b.set('y');
    expect(spy).toHaveBeenCalledOnce();
    c.get();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // https://github.com/preactjs/signals/blob/main/packages/core/test/signal.test.tsx#L940
  it('should be computed only when a dependency has changed at some point', () => {
    const a = new Signal.State('a');
    const spy = vi.fn(() => {
      return a.get();
    });
    const c = new Signal.Computed(spy);
    c.get();
    expect(spy).toHaveBeenCalledOnce();
    a.set('a');
    c.get();
    expect(spy).toHaveBeenCalledOnce();
  });

  // https://github.com/preactjs/signals/blob/main/packages/core/test/signal.test.tsx#L1693
  it('should support lazy branches', () => {
    const a = new Signal.State(0);
    const b = new Signal.Computed(() => a.get());
    const c = new Signal.Computed(() => (a.get() > 0 ? a.get() : b.get()));

    expect(c.get()).to.equal(0);
    a.set(1);
    expect(c.get()).to.equal(1);

    a.set(0);
    expect(c.get()).to.equal(0);
  });
});
