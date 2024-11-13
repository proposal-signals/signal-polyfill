// adapted from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/dynamicBench.ts

import {bench, expect} from 'vitest';
import {Signal} from '../../src';
import {setup} from '../gc';
import {batch} from '../effect';

// from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/util/pseudoRandom.ts

export function pseudoRandom(seed = 'seed'): () => number {
  const hash = xmur3a(seed);
  const rng = sfc32(hash(), hash(), hash(), hash());
  return rng;
}

/* these are adapted from https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 * (License: Public domain) */

/** random number generator originally in PractRand */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** MurmurHash3 */
export function xmur3a(str: string): () => number {
  let h = 2166136261 >>> 0;
  for (let k: number, i = 0; i < str.length; i++) {
    k = Math.imul(str.charCodeAt(i), 3432918353);
    k = (k << 15) | (k >>> 17);
    h ^= Math.imul(k, 461845907);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 3864292196) | 0;
  }
  h ^= str.length;
  return function () {
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

// from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/util/perfTests.ts

export interface TestResult {
  sum: number;
  count: number;
}

// from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/util/frameworkTypes.ts

interface TestConfig {
  /** friendly name for the test, should be unique */
  name?: string;

  /** width of dependency graph to construct */
  width: number;

  /** depth of dependency graph to construct */
  totalLayers: number;

  /** fraction of nodes that are static */ // TODO change to dynamicFraction
  staticFraction: number;

  /** construct a graph with number of sources in each node */
  nSources: number;

  /** fraction of [0, 1] elements in the last layer from which to read values in each test iteration */
  readFraction: number;

  /** number of test iterations */
  iterations: number;

  /** sum and count of all iterations, for verification */
  expected: Partial<TestResult>;
}

// from https://github.com/milomg/js-reactivity-benchmark/blob/main/src/util/dependencyGraph.ts

interface Graph {
  sources: Signal.State<number>[];
  layers: Signal.Computed<number>[][];
}

interface GraphAndCounter {
  graph: Graph;
  counter: Counter;
}

/**
 * Make a rectangular dependency graph, with an equal number of source elements
 * and computation elements at every layer.
 *
 * @param width number of source elements and number of computed elements per layer
 * @param totalLayers total number of source and computed layers
 * @param staticFraction every nth computed node is static (1 = all static, 3 = 2/3rd are dynamic)
 * @returns the graph
 */
function makeGraph(config: TestConfig): GraphAndCounter {
  const {width, totalLayers, staticFraction, nSources} = config;

  const sources = new Array(width).fill(0).map((_, i) => new Signal.State(i));
  const counter = new Counter();
  const rows = makeDependentRows(sources, totalLayers - 1, counter, staticFraction, nSources);
  const graph = {sources, layers: rows};
  return {graph, counter};
}

/**
 * Execute the graph by writing one of the sources and reading some or all of the leaves.
 *
 * @return the sum of all leaf values
 */
function runGraph(graph: Graph, iterations: number, readFraction: number): number {
  const rand = pseudoRandom();
  const {sources, layers} = graph;
  const leaves = layers[layers.length - 1];
  const skipCount = Math.round(leaves.length * (1 - readFraction));
  const readLeaves = removeElems(leaves, skipCount, rand);

  for (let i = 0; i < iterations; i++) {
    const sourceDex = i % sources.length;
    batch(() => {
      sources[sourceDex].set(i + sourceDex);
    });
    for (const leaf of readLeaves) {
      leaf.get();
    }
  }

  const sum = readLeaves.reduce((total, leaf) => leaf.get() + total, 0);
  return sum;
}

function removeElems<T>(src: T[], rmCount: number, rand: () => number): T[] {
  const copy = src.slice();
  for (let i = 0; i < rmCount; i++) {
    const rmDex = Math.floor(rand() * copy.length);
    copy.splice(rmDex, 1);
  }
  return copy;
}

class Counter {
  count = 0;
}

function makeDependentRows(
  sources: (Signal.Computed<number> | Signal.State<number>)[],
  numRows: number,
  counter: Counter,
  staticFraction: number,
  nSources: number,
): Signal.Computed<number>[][] {
  let prevRow = sources;
  const random = pseudoRandom();
  const rows: Signal.Computed<number>[][] = [];
  for (let l = 0; l < numRows; l++) {
    const row = makeRow(prevRow, counter, staticFraction, nSources, l, random);
    rows.push(row);
    prevRow = row;
  }
  return rows;
}

function makeRow(
  sources: (Signal.Computed<number> | Signal.State<number>)[],
  counter: Counter,
  staticFraction: number,
  nSources: number,
  layer: number,
  random: () => number,
): Signal.Computed<number>[] {
  return sources.map((_, myDex) => {
    const mySources: (Signal.Computed<number> | Signal.State<number>)[] = [];
    for (let sourceDex = 0; sourceDex < nSources; sourceDex++) {
      mySources.push(sources[(myDex + sourceDex) % sources.length]);
    }

    const staticNode = random() < staticFraction;
    if (staticNode) {
      // static node, always reference sources
      return new Signal.Computed(() => {
        counter.count++;

        let sum = 0;
        for (const src of mySources) {
          sum += src.get();
        }
        return sum;
      });
    } else {
      // dynamic node, drops one of the sources depending on the value of the first element
      const first = mySources[0];
      const tail = mySources.slice(1);
      const node = new Signal.Computed(() => {
        counter.count++;
        let sum = first.get();
        const shouldDrop = sum & 0x1;
        const dropDex = sum % tail.length;

        for (let i = 0; i < tail.length; i++) {
          if (shouldDrop && i === dropDex) continue;
          sum += tail[i].get();
        }

        return sum;
      });
      return node;
    }
  });
}

// cf https://github.com/milomg/js-reactivity-benchmark/blob/main/src/config.ts
const perfTests = [
  {
    name: 'simple component',
    width: 10, // can't change for decorator tests
    staticFraction: 1, // can't change for decorator tests
    nSources: 2, // can't change for decorator tests
    totalLayers: 5,
    readFraction: 0.2,
    iterations: 600000,
    expected: {
      sum: 19199968,
      count: 3480000,
    },
  },
  {
    name: 'dynamic component',
    width: 10,
    totalLayers: 10,
    staticFraction: 3 / 4,
    nSources: 6,
    readFraction: 0.2,
    iterations: 15000,
    expected: {
      sum: 302310782860,
      count: 1155000,
    },
  },
  {
    name: 'large web app',
    width: 1000,
    totalLayers: 12,
    staticFraction: 0.95,
    nSources: 4,
    readFraction: 1,
    iterations: 7000,
    expected: {
      sum: 29355933696000,
      count: 1463000,
    },
  },
  {
    name: 'wide dense',
    width: 1000,
    totalLayers: 5,
    staticFraction: 1,
    nSources: 25,
    readFraction: 1,
    iterations: 3000,
    expected: {
      sum: 1171484375000,
      count: 732000,
    },
  },
  {
    name: 'deep',
    width: 5,
    totalLayers: 500,
    staticFraction: 1,
    nSources: 3,
    readFraction: 1,
    iterations: 500,
    expected: {
      sum: 3.0239642676898464e241,
      count: 1246500,
    },
  },
  {
    name: 'very dynamic',
    width: 100,
    totalLayers: 15,
    staticFraction: 0.5,
    nSources: 6,
    readFraction: 1,
    iterations: 2000,
    expected: {
      sum: 15664996402790400,
      count: 1078000,
    },
  },
];

for (const config of perfTests) {
  const {graph, counter} = makeGraph(config);

  bench(
    `dynamic ${config.name}`,
    () => {
      counter.count = 0;
      const sum = runGraph(graph, config.iterations, config.readFraction);

      if (config.expected.sum) {
        expect(sum).toBe(config.expected.sum);
      }
      if (config.expected.count) {
        expect(counter.count).toBe(config.expected.count);
      }
    },
    {throws: true, setup},
  );
}
