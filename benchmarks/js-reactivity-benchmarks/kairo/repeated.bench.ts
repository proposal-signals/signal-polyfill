// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/kairo/repeated.ts

import {bench, expect} from 'vitest';
import {Signal} from '../../../src';
import {setup} from '../../gc';
import {batch, effect} from '../../effect';

const size = 30;

const head = new Signal.State(0);
const current = new Signal.Computed(() => {
  let result = 0;
  for (let i = 0; i < size; i++) {
    // tbh I think it's meanigless to be this big...
    result += head.get();
  }
  return result;
});

let callCounter = 0;
effect(() => {
  current.get();
  callCounter++;
});

bench(
  'repeated',
  () => {
    batch(() => {
      head.set(1);
    });
    expect(current.get()).toBe(size);
    const atleast = 100;
    callCounter = 0;
    for (let i = 0; i < 100; i++) {
      batch(() => {
        head.set(i);
      });
      expect(current.get()).toBe(i * size);
    }
    expect(callCounter).toBe(atleast);
  },
  {throws: true, setup},
);
