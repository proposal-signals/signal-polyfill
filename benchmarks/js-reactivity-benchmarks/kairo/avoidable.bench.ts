// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/kairo/avoidable.ts

import {bench, expect} from 'vitest';
import {Signal} from '../../../src';
import {setup} from '../../gc';
import {batch, effect} from '../../effect';

function busy() {
  let a = 0;
  for (let i = 0; i < 1_00; i++) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    a++;
  }
}

const head = new Signal.State(0);
const computed1 = new Signal.Computed(() => head.get());
const computed2 = new Signal.Computed(() => (computed1.get(), 0));
const computed3 = new Signal.Computed(() => (busy(), computed2.get() + 1)); // heavy computation
const computed4 = new Signal.Computed(() => computed3.get() + 2);
const computed5 = new Signal.Computed(() => computed4.get() + 3);
effect(() => {
  computed5.get();
  busy(); // heavy side effect
});

bench(
  'avoidablePropagation',
  () => {
    batch(() => {
      head.set(1);
    });
    expect(computed5.get()).toBe(6);
    for (let i = 0; i < 1000; i++) {
      batch(() => {
        head.set(i);
      });
      expect(computed5.get()).toBe(6);
    }
  },
  {throws: true, setup},
);
