// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/kairo/mux.ts

import {bench, expect} from 'vitest';
import {Signal} from '../../../src';
import {setup} from '../../gc';
import {batch, effect} from '../../effect';

const heads = new Array(100).fill(null).map(() => new Signal.State(0));
const mux = new Signal.Computed(() => {
  return Object.fromEntries(heads.map((h) => h.get()).entries());
});
const splited = heads
  .map((_, index) => new Signal.Computed(() => mux.get()[index]))
  .map((x) => new Signal.Computed(() => x.get() + 1));

splited.forEach((x) => {
  effect(() => x.get());
});

bench(
  'mux',
  () => {
    for (let i = 0; i < 10; i++) {
      batch(() => {
        heads[i].set(i);
      });
      expect(splited[i].get()).toBe(i + 1);
    }
    for (let i = 0; i < 10; i++) {
      batch(() => {
        heads[i].set(i * 2);
      });
      expect(splited[i].get()).toBe(i * 2 + 1);
    }
  },
  {throws: true, setup},
);
