// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/kairo/triangle.ts

import {bench, expect} from 'vitest';
import {Signal} from '../../../src';
import {setup} from '../../gc';
import {batch, effect} from '../../effect';

const width = 10;

const head = new Signal.State(0);
let current: Signal.State<number> | Signal.Computed<number> = head;
const list: (Signal.State<number> | Signal.Computed<number>)[] = [];
for (let i = 0; i < width; i++) {
  const c = current;
  list.push(current);
  current = new Signal.Computed(() => {
    return c.get() + 1;
  });
}
const sum = new Signal.Computed(() => {
  return list.map((x) => x.get()).reduce((a, b) => a + b, 0);
});

let callCounter = 0;

effect(() => {
  sum.get();
  callCounter++;
});

bench(
  'triangle',
  () => {
    const constant = count(width);
    batch(() => {
      head.set(1);
    });
    expect(sum.get()).toBe(constant);
    const atleast = 100;
    callCounter = 0;
    for (let i = 0; i < 100; i++) {
      batch(() => {
        head.set(i);
      });
      expect(sum.get()).toBe(constant - width + i * width);
    }
    expect(callCounter).toBe(atleast);
  },
  {throws: true, setup},
);

function count(number: number) {
  return new Array(number)
    .fill(0)
    .map((_, i) => i + 1)
    .reduce((x, y) => x + y, 0);
}
