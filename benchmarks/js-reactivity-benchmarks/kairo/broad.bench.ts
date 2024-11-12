// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/kairo/broad.ts

import {bench, expect} from 'vitest';
import {Signal} from '../../../src';
import {setup} from '../../gc';
import {batch, effect} from '../../effect';

const loopCount = 50;

const head = new Signal.State(0);
let last: Signal.Computed<number> | Signal.State<number> = head;
let callCounter = 0;
for (let i = 0; i < loopCount; i++) {
  const current = new Signal.Computed(() => {
    return head.get() + i;
  });
  const current2 = new Signal.Computed(() => {
    return current.get() + 1;
  });
  effect(() => {
    current2.get();
    callCounter++;
  });
  last = current2;
}

bench(
  'broad',
  () => {
    batch(() => {
      head.set(1);
    });
    const atleast = loopCount * loopCount;
    callCounter = 0;
    for (let i = 0; i < loopCount; i++) {
      batch(() => {
        head.set(i);
      });
      expect(last.get()).toBe(i + loopCount);
    }
    expect(callCounter).toBe(atleast);
  },
  {throws: true, setup},
);
