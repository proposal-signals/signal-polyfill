import {describe, expect, it, vi} from 'vitest';
import {Signal} from '../../src/wrapper.js';

describe('Signal.Volatile', () => {
  it('reads the value using the given function', () => {
    const volatile = new Signal.Volatile(() => 'value');

    expect(volatile.get()).toBe('value');
  });

  it('always reads values from source when not observed', () => {
    let count = 0;
    const spy = vi.fn(() => count++);
    const volatile = new Signal.Volatile(spy);

    expect(spy).not.toHaveBeenCalled();

    expect(volatile.get()).toBe(0);
    expect(volatile.get()).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('calls the subscribe function when observed', () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const volatile = new Signal.Volatile(() => 'value', {
      subscribe,
    });

    expect(subscribe).not.toHaveBeenCalled();
    const watcher = new Signal.subtle.Watcher(() => {});
    watcher.watch(volatile);

    expect(subscribe).toHaveBeenCalled();
  });

  it('unsubscribes when the function is no longer observed', () => {
    const unsubscribe = vi.fn();
    const volatile = new Signal.Volatile(() => 'value', {
      subscribe: () => unsubscribe,
    });

    const watcher = new Signal.subtle.Watcher(() => {});
    watcher.watch(volatile);
    expect(unsubscribe).not.toHaveBeenCalled();

    watcher.unwatch(volatile);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('uses the wrapper context when invoking subscribe/unsubscribe', () => {
    const subscribe = vi.fn(function () {
      expect(this).toBeInstanceOf(Signal.Volatile);
      return unsubscribe;
    });

    const unsubscribe = vi.fn(function () {
      expect(this).toBeInstanceOf(Signal.Volatile);
    });

    const volatile = new Signal.Volatile(() => 'value', {subscribe});

    const watcher = new Signal.subtle.Watcher(() => {});

    watcher.watch(volatile);
    expect(subscribe).toHaveBeenCalled();

    watcher.unwatch(volatile);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('survives subscribe without an unsubscribe callback', () => {
    const volatile = new Signal.Volatile(() => 'value', {
      subscribe: () => {},
    });

    const watcher = new Signal.subtle.Watcher(() => {});
    watcher.watch(volatile);
    const pass = () => watcher.unwatch(volatile);

    expect(pass).not.toThrow();
  });

  it('returns the cached value when observed', () => {
    const getSnapshot = vi.fn(() => 'value');
    const volatile = new Signal.Volatile(getSnapshot, {
      subscribe: () => {},
    });

    // Promote the volatile to a 'live' producer.
    const watcher = new Signal.subtle.Watcher(() => {});
    watcher.watch(volatile);

    // Cache the value. Depend on `onChange` to tell us of changes.
    expect(volatile.get()).toBe('value');
    expect(volatile.get()).toBe('value');
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('can be cached by consumers while observed', () => {
    const getSnapshot = vi.fn(() => 'value');
    const volatile = new Signal.Volatile(getSnapshot, {
      subscribe: () => {},
    });

    const watcher = new Signal.subtle.Watcher(() => {});
    watcher.watch(volatile);

    expect(getSnapshot).not.toHaveBeenCalled();
    const computed = new Signal.Computed(() => volatile.get());

    expect(computed.get()).toBe('value');
    expect(computed.get()).toBe('value');
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('notifies consumers when a subscribed value changes', () => {
    let onChange: () => void;
    let value = 'initial value';
    const volatile = new Signal.Volatile(() => value, {
      subscribe: (cb) => (onChange = cb),
    });

    const notifySpy = vi.fn();
    const watcher = new Signal.subtle.Watcher(notifySpy);
    watcher.watch(volatile);

    expect(notifySpy).not.toHaveBeenCalled();

    expect(volatile.get()).toBe('initial value');
    expect(notifySpy).not.toHaveBeenCalled();

    value = 'changed';
    onChange!?.();
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(volatile.get()).toBe('changed');
  });

  it('tracks its own sources and sinks', () => {
    const source = new Signal.State(0);
    const volatile = new Signal.Volatile(() => {
      return source.get();
    });

    const watcher = new Signal.subtle.Watcher(() => {});
    expect(Signal.subtle.hasSinks(volatile)).toBe(false);

    watcher.watch(volatile);
    expect(Signal.subtle.hasSinks(volatile)).toBe(true);

    expect(Signal.subtle.hasSources(volatile)).toBe(false);
    volatile.get();
    expect(Signal.subtle.hasSources(volatile)).toBe(true);
  });

  it('subscribes to dependencies and recomputes when they change', () => {
    const source = new Signal.State('initial');
    const getSnapshot = vi.fn(() => source.get());
    const volatile = new Signal.Volatile(getSnapshot, {
      subscribe() {}, // Enable an upgrade to non-volatile.
    });

    const watcher = new Signal.subtle.Watcher(() => {});
    watcher.watch(volatile);
    expect(getSnapshot).not.toHaveBeenCalled();

    expect(volatile.get()).toBe('initial');
    expect(volatile.get()).toBe('initial');
    expect(getSnapshot).toHaveBeenCalledTimes(1);

    source.set('updated');
    expect(volatile.get()).toBe('updated');
    expect(volatile.get()).toBe('updated');
    expect(getSnapshot).toHaveBeenCalledTimes(2);
  });

  it('is cached only when live', () => {
    let count = 0;
    let onChange: () => void;
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((notify) => {
      onChange = notify;
      return unsubscribe;
    });
    const volatile = new Signal.Volatile(() => count++, {
      subscribe,
    });
    const dep1 = new Signal.Computed(() => volatile.get());
    const dep2 = new Signal.Computed(() => volatile.get());
    const result = new Signal.Computed(
      () => `${dep1.get()},${dep1.get()},${dep2.get()},${dep2.get()}`,
    );
    expect(result.get()).toBe('0,1,2,3');
    expect(result.get()).toBe('4,5,6,7');
    const listener = vi.fn();
    const watcher = new Signal.subtle.Watcher(listener);
    expect(subscribe).not.toHaveBeenCalled();
    watcher.watch(result);
    expect(subscribe).toHaveBeenCalledTimes(1);
    subscribe.mockClear();
    expect(result.get()).toBe('8,8,8,8');
    expect(listener).not.toHaveBeenCalled();
    onChange!();
    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();
    expect(result.get()).toBe('9,9,9,9');
    expect(unsubscribe).not.toHaveBeenCalled();
    watcher.unwatch(result);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    unsubscribe.mockClear();
    expect(result.get()).toBe('10,11,12,13');
    expect(result.get()).toBe('14,15,16,17');

    // check that our listeners were not called again:
    expect(subscribe).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});
