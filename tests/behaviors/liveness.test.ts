import {describe, expect, it, vi} from 'vitest';
import {Signal} from '../../src/wrapper.js';

describe('liveness', () => {
  it('only changes on first and last descendant', () => {
    const watchedSpy = vi.fn();
    const unwatchedSpy = vi.fn();
    const state = new Signal.State(1, {
      [Signal.subtle.watched]: watchedSpy,
      [Signal.subtle.unwatched]: unwatchedSpy,
    });
    const computed = new Signal.Computed(() => state.get());
    computed.get();
    expect(watchedSpy).not.toBeCalled();
    expect(unwatchedSpy).not.toBeCalled();

    const w = new Signal.subtle.Watcher(() => {});
    const w2 = new Signal.subtle.Watcher(() => {});

    w.watch(computed);
    expect(watchedSpy).toBeCalledTimes(1);
    expect(unwatchedSpy).not.toBeCalled();

    w2.watch(computed);
    expect(watchedSpy).toBeCalledTimes(1);
    expect(unwatchedSpy).not.toBeCalled();

    w2.unwatch(computed);
    expect(watchedSpy).toBeCalledTimes(1);
    expect(unwatchedSpy).not.toBeCalled();

    w.unwatch(computed);
    expect(watchedSpy).toBeCalledTimes(1);
    expect(unwatchedSpy).toBeCalledTimes(1);
  });

  it('is tracked well on computed signals', () => {
    const watchedSpy = vi.fn();
    const unwatchedSpy = vi.fn();
    const s = new Signal.State(1);
    const c = new Signal.Computed(() => s.get(), {
      [Signal.subtle.watched]: watchedSpy,
      [Signal.subtle.unwatched]: unwatchedSpy,
    });

    c.get();
    expect(watchedSpy).not.toBeCalled();
    expect(unwatchedSpy).not.toBeCalled();

    const w = new Signal.subtle.Watcher(() => {});
    w.watch(c);
    expect(watchedSpy).toBeCalledTimes(1);
    expect(unwatchedSpy).not.toBeCalled();

    w.unwatch(c);
    expect(watchedSpy).toBeCalledTimes(1);
    expect(unwatchedSpy).toBeCalledTimes(1);
  });

  it('is possible to update a signal in the watch callback', () => {
    const logs: string[] = [];
    let indent = '';
    const logFn = (msg: string) => () => {
      logs.push(`${indent}${msg}`);
    };
    const wrapFn =
      <T>(logMsg: string, fn: () => T) =>
      (): T => {
        logs.push(`${indent}start ${logMsg}`);
        const prevIndent = indent;
        indent += '  ';
        const res = fn();
        indent = prevIndent;
        logs.push(`${indent}end ${logMsg} returning ${res}`);
        return res;
      };
    const wrapComputed = <T>(logMsg: string, fn: () => T) =>
      new Signal.Computed(wrapFn(`${logMsg} computing`, fn), {
        [Signal.subtle.watched]: logFn(`${logMsg} watched`),
        [Signal.subtle.unwatched]: logFn(`${logMsg} unwatched`),
      });
    const signal = new Signal.State(0, {
      [Signal.subtle.watched]: wrapFn('signal watched', () => {
        const value = signal.get() + 1;
        logs.push(`${indent}signal.set(${value})`);
        signal.set(value);
      }),
      [Signal.subtle.unwatched]: logFn('signal unwatched'),
    });
    const dep1 = wrapComputed('dep1', () => `${signal.get()},${signal.get()}`);
    const dep2 = wrapComputed('dep2', () => `${signal.get()},${signal.get()}`);
    const dep3 = wrapComputed('result', () => `${dep1.get()},${dep2.get()}`);

    expect(wrapFn('signal.get 1', () => signal.get())()).toBe(1);
    expect(wrapFn('signal.get 2', () => signal.get())()).toBe(2);
    expect(wrapFn('dep1.get', () => dep1.get())()).toBe('3,3');
    expect(wrapFn('dep1.get', () => dep1.get())()).toBe('4,4');
    expect(wrapFn('dep2.get', () => dep2.get())()).toBe('5,5');
    expect(wrapFn('dep2.get', () => dep2.get())()).toBe('6,6');
    expect(wrapFn('dep3.get', () => dep3.get())()).toBe('7,7,7,7');
    expect(wrapFn('dep3.get', () => dep3.get())()).toBe('8,8,8,8');
    console.log(logs);
    // expect(logs).toMatchInlineSnapshot();
  });
});
