// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/molBench.ts

import {bench} from 'vitest';
import {Signal} from '../../src';
import {setup} from '../gc';
import {batch, effect} from '../effect';

function fib(n: number): number {
  if (n < 2) return 1;
  return fib(n - 1) + fib(n - 2);
}

function hard(n: number) {
  return n + fib(16);
}

const numbers = Array.from({length: 5}, (_, i) => i);

const res: number[] = [];

const A = new Signal.State(0);
const B = new Signal.State(0);
const C = new Signal.Computed(() => (A.get() % 2) + (B.get() % 2));
const D = new Signal.Computed(() => numbers.map((i) => ({x: i + (A.get() % 2) - (B.get() % 2)})));
const E = new Signal.Computed(() => hard(C.get() + A.get() + D.get()[0].x /*, 'E'*/));
const F = new Signal.Computed(() => hard(D.get()[2].x || B.get() /*, 'F'*/));
const G = new Signal.Computed(() => C.get() + (C.get() || E.get() % 2) + D.get()[4].x + F.get());
effect(() => res.push(hard(G.get() /*, 'H'*/)));
effect(() => res.push(G.get()));
effect(() => res.push(hard(F.get() /*, 'J'*/)));

bench(
  'molBench',
  () => {
    for (let i = 0; i < 1e4; i++) {
      res.length = 0;
      batch(() => {
        B.set(1);
        A.set(1 + i * 2);
      });
      batch(() => {
        A.set(2 + i * 2);
        B.set(2);
      });
    }
  },
  {throws: true, setup},
);
