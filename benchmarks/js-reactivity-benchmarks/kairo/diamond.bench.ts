// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/kairo/diamond.ts

import {bench, expect} from 'vitest';
import {Signal} from '../../../src';
import {setup} from '../../gc';
import {batch, effect} from '../../effect';

const width = 5;

const head = new Signal.State(0);
const current: Signal.Computed<number>[] = [];
for (let i = 0; i < width; i++) {
  current.push(new Signal.Computed(() => head.get() + 1));
}
const sum = new Signal.Computed(() => current.map((x) => x.get()).reduce((a, b) => a + b, 0));
let callCounter = 0;
effect(() => {
  sum.get();
  callCounter++;
});

bench(
  'diamond',
  () => {
    batch(() => {
      head.set(1);
    });
    expect(sum.get()).toBe(2 * width);
    const atleast = 500;
    callCounter = 0;
    for (let i = 0; i < 500; i++) {
      batch(() => {
        head.set(i);
      });
      expect(sum.get()).toBe((i + 1) * width);
    }
    expect(callCounter).toBe(atleast);
  },
  {throws: true, setup},
);
