// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/cellxBench.ts

import {bench, expect} from 'vitest';
import {Signal} from '../../src';
import {setup} from '../gc';
import {effect, batch} from '../effect';

// The following is an implementation of the cellx benchmark https://github.com/Riim/cellx/blob/master/perf/perf.html

const cellx = (
  layers: number,
  expectedBefore: readonly [number, number, number, number],
  expectedAfter: readonly [number, number, number, number],
) => {
  const start = {
    prop1: new Signal.State(1),
    prop2: new Signal.State(2),
    prop3: new Signal.State(3),
    prop4: new Signal.State(4),
  };

  let layer: {
    prop1: Signal.Computed<number> | Signal.State<number>;
    prop2: Signal.Computed<number> | Signal.State<number>;
    prop3: Signal.Computed<number> | Signal.State<number>;
    prop4: Signal.Computed<number> | Signal.State<number>;
  } = start;

  for (let i = layers; i > 0; i--) {
    const m = layer;
    const s = {
      prop1: new Signal.Computed(() => m.prop2.get()),
      prop2: new Signal.Computed(() => m.prop1.get() - m.prop3.get()),
      prop3: new Signal.Computed(() => m.prop2.get() + m.prop4.get()),
      prop4: new Signal.Computed(() => m.prop3.get()),
    };

    effect(() => s.prop1.get());
    effect(() => s.prop2.get());
    effect(() => s.prop3.get());
    effect(() => s.prop4.get());

    s.prop1.get();
    s.prop2.get();
    s.prop3.get();
    s.prop4.get();

    layer = s;
  }

  const end = layer;

  expect(end.prop1.get()).toBe(expectedBefore[0]);
  expect(end.prop2.get()).toBe(expectedBefore[1]);
  expect(end.prop3.get()).toBe(expectedBefore[2]);
  expect(end.prop4.get()).toBe(expectedBefore[3]);

  batch(() => {
    start.prop1.set(4);
    start.prop2.set(3);
    start.prop3.set(2);
    start.prop4.set(1);
  });

  expect(end.prop1.get()).toBe(expectedAfter[0]);
  expect(end.prop2.get()).toBe(expectedAfter[1]);
  expect(end.prop3.get()).toBe(expectedAfter[2]);
  expect(end.prop4.get()).toBe(expectedAfter[3]);
};

type BenchmarkResults = [
  readonly [number, number, number, number],
  readonly [number, number, number, number],
];

const expected: Record<number, BenchmarkResults> = {
  1000: [
    [-3, -6, -2, 2],
    [-2, -4, 2, 3],
  ],
  2500: [
    [-3, -6, -2, 2],
    [-2, -4, 2, 3],
  ],
  5000: [
    [2, 4, -1, -6],
    [-2, 1, -4, -4],
  ],
};

for (const layers in expected) {
  const params = expected[layers];
  bench(`cellx${layers}`, () => cellx(+layers, params[0], params[1]), {throws: true, setup});
}
