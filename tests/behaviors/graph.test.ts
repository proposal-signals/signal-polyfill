import {describe, it, vi, expect} from 'vitest';
import {Signal} from '../../src';

/**
 * SolidJS graph tests
 *
 * https://github.com/solidjs/signals/blob/main/tests/graph.test.ts
 */

describe('Graph', () => {
  it('should drop X->B->X updates', () => {
    //     X
    //   / |
    //  A  | <- Looks like a flag doesn't it? :D
    //   \ |
    //     B
    //     |
    //     C

    const $x = new Signal.State(2);

    const $a = new Signal.Computed(() => $x.get() - 1);
    const $b = new Signal.Computed(() => $x.get() + $a.get());

    const compute = vi.fn(() => 'c: ' + $b.get());
    const $c = new Signal.Computed(compute);

    expect($c.get()).toBe('c: 3');
    expect(compute).toHaveBeenCalledTimes(1);
    compute.mockReset();

    $x.set(4);
    $c.get();
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('should only update every signal once (diamond graph)', () => {
    // In this scenario "D" should only update once when "A" receive an update. This is sometimes
    // referred to as the "diamond" scenario.
    //     X
    //   /   \
    //  A     B
    //   \   /
    //     C

    const $x = new Signal.State('a');
    const $a = new Signal.Computed(() => $x.get());
    const $b = new Signal.Computed(() => $x.get());

    const spy = vi.fn(() => $a.get() + ' ' + $b.get());
    const $c = new Signal.Computed(spy);

    expect($c.get()).toBe('a a');
    expect(spy).toHaveBeenCalledTimes(1);

    $x.set('aa');
    expect($c.get()).toBe('aa aa');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should only update every signal once (diamond graph + tail)', () => {
    // "D" will be likely updated twice if our mark+sweep logic is buggy.
    //     X
    //   /   \
    //  A     B
    //   \   /
    //     C
    //     |
    //     D

    const $x = new Signal.State('a');

    const $a = new Signal.Computed(() => $x.get());
    const $b = new Signal.Computed(() => $x.get());
    const $c = new Signal.Computed(() => $a.get() + ' ' + $b.get());

    const spy = vi.fn(() => $c.get());
    const $d = new Signal.Computed(spy);

    expect($d.get()).toBe('a a');
    expect(spy).toHaveBeenCalledTimes(1);

    $x.set('aa');
    expect($d.get()).toBe('aa aa');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should bail out if result is the same', () => {
    // Bail out if value of "A" never changes
    // X->A->B

    // const $x = new Signal.State('a');
    const $x = new Signal.State('a');

    const $a = new Signal.Computed(() => {
      $x.get();
      return 'foo';
    });

    const spy = vi.fn(() => $a.get());
    const $b = new Signal.Computed(spy);

    expect($b.get()).toBe('foo');
    expect(spy).toHaveBeenCalledTimes(1);

    $x.set('aa');
    expect($b.get()).toBe('foo');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should only update every signal once (jagged diamond graph + tails)', () => {
    // "E" and "F" will be likely updated >3 if our mark+sweep logic is buggy.
    //     X
    //   /   \
    //  A     B
    //  |     |
    //  |     C
    //   \   /
    //     D
    //   /   \
    //  E     F

    const $x = new Signal.State('a');

    const $a = new Signal.Computed(() => $x.get());
    const $b = new Signal.Computed(() => $x.get());
    const $c = new Signal.Computed(() => $b.get());

    const dSpy = vi.fn(() => $a.get() + ' ' + $c.get());
    const $d = new Signal.Computed(dSpy);

    const eSpy = vi.fn(() => $d.get());
    const $e = new Signal.Computed(eSpy);
    const fSpy = vi.fn(() => $d.get());
    const $f = new Signal.Computed(fSpy);

    expect($e.get()).toBe('a a');
    expect(eSpy).toHaveBeenCalledTimes(1);

    expect($f.get()).toBe('a a');
    expect(fSpy).toHaveBeenCalledTimes(1);

    $x.set('b');

    expect($d.get()).toBe('b b');
    expect(dSpy).toHaveBeenCalledTimes(2);

    expect($e.get()).toBe('b b');
    expect(eSpy).toHaveBeenCalledTimes(2);

    expect($f.get()).toBe('b b');
    expect(fSpy).toHaveBeenCalledTimes(2);

    $x.set('c');

    expect($d.get()).toBe('c c');
    expect(dSpy).toHaveBeenCalledTimes(3);

    expect($e.get()).toBe('c c');
    expect(eSpy).toHaveBeenCalledTimes(3);

    expect($f.get()).toBe('c c');
    expect(fSpy).toHaveBeenCalledTimes(3);
  });

  it('should ensure subs update even if one dep is static', () => {
    //     X
    //   /   \
    //  A     *B <- returns same value every time
    //   \   /
    //     C

    const $x = new Signal.State('a');

    const $a = new Signal.Computed(() => $x.get());
    const $b = new Signal.Computed(() => {
      $x.get();
      return 'c';
    });

    const spy = vi.fn(() => $a.get() + ' ' + $b.get());
    const $c = new Signal.Computed(spy);

    expect($c.get()).toBe('a c');

    $x.set('aa');

    expect($c.get()).toBe('aa c');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should ensure subs update even if two deps mark it clean', () => {
    // In this scenario both "B" and "C" always return the same value. But "D" must still update
    // because "X" marked it. If "D" isn't updated, then we have a bug.
    //     X
    //   / | \
    //  A *B *C
    //   \ | /
    //     D

    const $x = new Signal.State('a');

    const $b = new Signal.Computed(() => $x.get());
    const $c = new Signal.Computed(() => {
      $x.get();
      return 'c';
    });
    const $d = new Signal.Computed(() => {
      $x.get();
      return 'd';
    });

    const spy = vi.fn(() => $b.get() + ' ' + $c.get() + ' ' + $d.get());
    const $e = new Signal.Computed(spy);

    expect($e.get()).toBe('a c d');

    $x.set('aa');

    expect($e.get()).toBe('aa c d');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('propagates in topological order', () => {
    //
    //     c1
    //    /  \
    //   /    \
    //  b1     b2
    //   \    /
    //    \  /
    //     a1
    //
    var seq = '',
      a1 = new Signal.State(false),
      b1 = new Signal.Computed(
        () => {
          a1.get();
          seq += 'b1';
        },
        {equals: () => false},
      ),
      b2 = new Signal.Computed(
        () => {
          a1.get();
          seq += 'b2';
        },
        {equals: () => false},
      ),
      c1 = new Signal.Computed(
        () => {
          b1.get(), b2.get();
          seq += 'c1';
        },
        {equals: () => false},
      );

    c1.get();
    seq = '';
    a1.set(true);
    c1.get();
    expect(seq).toBe('b1b2c1');
  });

  it('only propagates once with linear convergences', () => {
    //         d
    //         |
    // +---+---+---+---+
    // v   v   v   v   v
    // f1  f2  f3  f4  f5
    // |   |   |   |   |
    // +---+---+---+---+
    //         v
    //         g
    var d = new Signal.State(0),
      f1 = new Signal.Computed(() => d.get()),
      f2 = new Signal.Computed(() => d.get()),
      f3 = new Signal.Computed(() => d.get()),
      f4 = new Signal.Computed(() => d.get()),
      f5 = new Signal.Computed(() => d.get()),
      gcount = 0,
      g = new Signal.Computed(() => {
        gcount++;
        return f1.get() + f2.get() + f3.get() + f4.get() + f5.get();
      });

    g.get();
    gcount = 0;
    d.set(1);
    g.get();
    expect(gcount).toBe(1);
  });

  it('only propagates once with exponential convergence', () => {
    //     d
    //     |
    // +---+---+
    // v   v   v
    // f1  f2 f3
    //   \ | /
    //     O
    //   / | \
    // v   v   v
    // g1  g2  g3
    // +---+---+
    //     v
    //     h
    var d = new Signal.State(0),
      f1 = new Signal.Computed(() => {
        return d.get();
      }),
      f2 = new Signal.Computed(() => {
        return d.get();
      }),
      f3 = new Signal.Computed(() => {
        return d.get();
      }),
      g1 = new Signal.Computed(() => {
        return f1.get() + f2.get() + f3.get();
      }),
      g2 = new Signal.Computed(() => {
        return f1.get() + f2.get() + f3.get();
      }),
      g3 = new Signal.Computed(() => {
        return f1.get() + f2.get() + f3.get();
      }),
      hcount = 0,
      h = new Signal.Computed(() => {
        hcount++;
        return g1.get() + g2.get() + g3.get();
      });
    h.get();
    hcount = 0;
    d.set(1);
    h.get();
    expect(hcount).toBe(1);
  });

  it('does not trigger downstream computations unless changed', () => {
    const s1 = new Signal.State(1, {equals: () => false});
    let order = '';
    const t1 = new Signal.Computed(() => {
      order += 't1';
      return s1.get();
    });
    const t2 = new Signal.Computed(() => {
      order += 'c1';
      t1.get();
    });
    t2.get();
    expect(order).toBe('c1t1');
    order = '';
    s1.set(1);
    t2.get();
    expect(order).toBe('t1');
    order = '';
    s1.set(2);
    t2.get();
    expect(order).toBe('t1c1');
  });

  it('applies updates to changed dependees in same order as new Signal.Computed', () => {
    const s1 = new Signal.State(0);
    let order = '';
    const t1 = new Signal.Computed(() => {
      order += 't1';
      return s1.get() === 0;
    });
    const t2 = new Signal.Computed(() => {
      order += 'c1';
      return s1.get();
    });
    const t3 = new Signal.Computed(() => {
      order += 'c2';
      return t1.get();
    });
    t2.get();
    t3.get();
    expect(order).toBe('c1c2t1');
    order = '';
    s1.set(1);
    t2.get();
    t3.get();
    expect(order).toBe('c1t1c2');
  });

  it('updates downstream pending computations', () => {
    const s1 = new Signal.State(0);
    const s2 = new Signal.State(0);
    let order = '';
    const t1 = new Signal.Computed(() => {
      order += 't1';
      return s1.get() === 0;
    });
    const t2 = new Signal.Computed(() => {
      order += 'c1';
      return s1.get();
    });
    const t3 = new Signal.Computed(() => {
      order += 'c2';
      t1.get();
      return new Signal.Computed(() => {
        order += 'c2_1';
        return s2.get();
      });
    });
    order = '';
    s1.set(1);
    t2.get();
    t3.get().get();
    expect(order).toBe('c1c2t1c2_1');
  });

  describe('with changing dependencies', () => {
    let i: {get: () => boolean; set: (v: boolean) => void};
    let t: {get: () => number; set: (v: number) => void};
    let e: {get: () => number; set: (v: number) => void};
    let fevals: number;
    let f: {get: () => number};

    function init() {
      i = new Signal.State<boolean>(true);
      t = new Signal.State(1);
      e = new Signal.State(2);
      fevals = 0;
      f = new Signal.Computed(() => {
        fevals++;
        return i.get() ? t.get() : e.get();
      });
      f.get();
      fevals = 0;
    }

    it('updates on active dependencies', () => {
      init();
      t.set(5);
      expect(f.get()).toBe(5);
      expect(fevals).toBe(1);
    });

    it('does not update on inactive dependencies', () => {
      init();
      e.set(5);
      expect(f.get()).toBe(1);
      expect(fevals).toBe(0);
    });

    it('deactivates obsolete dependencies', () => {
      init();
      i.set(false);
      f.get();
      fevals = 0;
      t.set(5);
      f.get();
      expect(fevals).toBe(0);
    });

    it('activates new dependencies', () => {
      init();
      i.set(false);
      fevals = 0;
      e.set(5);
      f.get();
      expect(fevals).toBe(1);
    });

    it('ensures that new dependencies are updated before dependee', () => {
      var order = '',
        a = new Signal.State(0),
        b = new Signal.Computed(() => {
          order += 'b';
          return a.get() + 1;
        }),
        c = new Signal.Computed(() => {
          order += 'c';
          const check = b.get();
          if (check) {
            return check;
          }
          return e.get();
        }),
        d = new Signal.Computed(() => {
          return a.get();
        }),
        e = new Signal.Computed(() => {
          order += 'd';
          return d.get() + 10;
        });

      c.get();
      e.get();
      expect(order).toBe('cbd');

      order = '';
      a.set(-1);
      c.get();
      e.get();

      expect(order).toBe('bcd');
      expect(c.get()).toBe(9);

      order = '';
      a.set(0);
      c.get();
      e.get();
      expect(order).toBe('bcd');
      expect(c.get()).toBe(1);
    });
  });

  it('does not update subsequent pending computations after stale invocations', () => {
    const s1 = new Signal.State(1);
    const s2 = new Signal.State(false);
    let count = 0;
    /*
                  s1
                  |
              +---+---+
             t1 t2 c1 t3
              \       /
                 c3
           [PN,PN,STL,void]
      */
    const t1 = new Signal.Computed(() => s1.get() > 0);
    const t2 = new Signal.Computed(() => s1.get() > 0);
    const c1 = new Signal.Computed(() => s1.get());
    const t3 = new Signal.Computed(() => {
      const a = s1.get();
      const b = s2.get();
      return a && b;
    });
    const c3 = new Signal.Computed(() => {
      t1.get();
      t2.get();
      c1.get();
      t3.get();
      count++;
    });
    c3.get();
    s2.set(true);
    c3.get();
    expect(count).toBe(2);
    s1.set(2);
    c3.get();
    expect(count).toBe(3);
  });

  it('evaluates stale computations before dependees when trackers stay unchanged', () => {
    let s1 = new Signal.State(1, {equals: () => false});
    let order = '';
    let t1 = new Signal.Computed(() => {
      order += 't1';
      return s1.get() > 2;
    });
    let t2 = new Signal.Computed(() => {
      order += 't2';
      return s1.get() > 2;
    });
    let c1 = new Signal.Computed(
      () => {
        order += 'c1';
        s1.get();
      },
      {
        equals: () => false,
      },
    );
    const c2 = new Signal.Computed(() => {
      order += 'c2';
      t1.get();
      t2.get();
      c1.get();
    });
    c2.get();
    order = '';
    s1.set(1);
    c2.get();
    expect(order).toBe('t1t2c1c2');
    order = '';
    s1.set(3);
    c2.get();
    expect(order).toBe('t1c2t2c1');
  });

  it('correctly marks downstream computations as stale on change', () => {
    const s1 = new Signal.State(1);
    let order = '';
    const t1 = new Signal.Computed(() => {
      order += 't1';
      return s1.get();
    });
    const c1 = new Signal.Computed(() => {
      order += 'c1';
      return t1.get();
    });
    const c2 = new Signal.Computed(() => {
      order += 'c2';
      return c1.get();
    });
    const c3 = new Signal.Computed(() => {
      order += 'c3';
      return c2.get();
    });
    c3.get();
    order = '';
    s1.set(2);
    c3.get();
    expect(order).toBe('t1c1c2c3');
  });

  // https://github.com/preactjs/signals/blob/main/packages/core/test/signal.test.tsx#L1706
  it('should not update a sub if all deps unmark it', () => {
    // In this scenario "B" and "C" always return the same value. When "A"
    // changes, "D" should not update.
    //     A
    //   /   \
    // *B     *C
    //   \   /
    //     D

    const a = new Signal.State('a');
    const b = new Signal.Computed(() => {
      a.get();
      return 'b';
    });
    const c = new Signal.Computed(() => {
      a.get();
      return 'c';
    });
    const spy = vi.fn(() => b.get() + ' ' + c.get());
    const d = new Signal.Computed(spy);

    expect(d.get()).toBe('b c');
    spy.mockReset();

    a.set('aa');
    expect(spy).not.toHaveBeenCalled();
  });
});
