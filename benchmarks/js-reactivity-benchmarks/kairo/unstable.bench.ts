// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/kairo/unstable.ts

import {bench, expect} from 'vitest';
import {Signal} from '../../../src';
import {setup} from '../../gc';
import {batch, effect} from '../../effect';

const head = new Signal.State(0);
const double = new Signal.Computed(() => head.get() * 2);
const inverse = new Signal.Computed(() => -head.get());
const current = new Signal.Computed(() => {
  let result = 0;
  for (let i = 0; i < 20; i++) {
    result += head.get() % 2 ? double.get() : inverse.get();
  }
  return result;
});

let callCounter = 0;
effect(() => {
  current.get();
  callCounter++;
});

bench(
  'unstable',
  () => {
    batch(() => {
      head.set(1);
    });
    expect(current.get()).toBe(40);
    const atleast = 100;
    callCounter = 0;
    for (let i = 0; i < 100; i++) {
      batch(() => {
        head.set(i);
      });
      // expect(current()).toBe(i % 2 ? i * 2 * 10 : i * -10);
    }
    expect(callCounter).toBe(atleast);
  },
  {throws: true, setup},
);
