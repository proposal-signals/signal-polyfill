// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/kairo/deep.ts

import {bench, expect} from 'vitest';
import {Signal} from '../../../src';
import {setup} from '../../gc';
import {batch, effect} from '../../effect';

const len = 50;

const head = new Signal.State(0);
let current: Signal.State<number> | Signal.Computed<number> = head;
for (let i = 0; i < len; i++) {
  const c = current;
  current = new Signal.Computed(() => {
    return c.get() + 1;
  });
}
let callCounter = 0;

effect(() => {
  current.get();
  callCounter++;
});

const iter = 50;

bench(
  'deep',
  () => {
    batch(() => {
      head.set(1);
    });
    const atleast = iter;
    callCounter = 0;
    for (let i = 0; i < iter; i++) {
      batch(() => {
        head.set(i);
      });
      expect(current.get()).toBe(len + i);
    }
    expect(callCounter).toBe(atleast);
  },
  {throws: true, setup},
);
