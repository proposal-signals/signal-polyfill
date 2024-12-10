/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {defaultEquals, ValueEqualityFn} from './equality.js';
import {
  consumerAfterComputation,
  consumerBeforeComputation,
  consumerPollProducersForChange,
  producerAccessed,
  producerUpdateValueVersion,
  REACTIVE_NODE,
  ReactiveNode,
  SIGNAL,
  Version,
} from './graph.js';

/**
 * A computation, which derives a value from a declarative reactive expression.
 *
 * `Computed`s are both producers and consumers of reactivity.
 */
export interface ComputedNode<T> extends ReactiveNode {
  /**
   * Current value of the computation, or one of the sentinel values above (`UNSET`, `COMPUTING`,
   * `ERROR`).
   */
  value: T;

  /**
   * If `value` is `ERRORED`, the error caught from the last computation attempt which will
   * be re-thrown.
   */
  error: unknown;

  /**
   * The computation function which will produce a new value.
   */
  computation: () => T;

  equal: ValueEqualityFn<T>;
  equalCache: Record<number, boolean> | null;
}

export type ComputedGetter<T> = (() => T) & {
  [SIGNAL]: ComputedNode<T>;
};

export function computedGet<T>(node: ComputedNode<T>) {
  // Check if the value needs updating before returning it.
  producerUpdateValueVersion(node);

  // Record that someone looked at this signal.
  producerAccessed(node);

  if (node.value === ERRORED) {
    throw node.error;
  }

  return node.value;
}

/**
 * Create a computed signal which derives a reactive value from an expression.
 */
export function createComputed<T>(computation: () => T): ComputedGetter<T> {
  const node: ComputedNode<T> = Object.create(COMPUTED_NODE);
  node.computation = computation;

  const computed = () => computedGet(node);
  (computed as ComputedGetter<T>)[SIGNAL] = node;
  return computed as unknown as ComputedGetter<T>;
}

/**
 * A dedicated symbol used before a computed value has been calculated for the first time.
 * Explicitly typed as `any` so we can use it as signal's value.
 */
const UNSET: any = /* @__PURE__ */ Symbol('UNSET');

/**
 * A dedicated symbol used in place of a computed signal value to indicate that a given computation
 * is in progress. Used to detect cycles in computation chains.
 * Explicitly typed as `any` so we can use it as signal's value.
 */
const COMPUTING: any = /* @__PURE__ */ Symbol('COMPUTING');

/**
 * A dedicated symbol used in place of a computed signal value to indicate that a given computation
 * failed. The thrown error is cached until the computation gets dirty again.
 * Explicitly typed as `any` so we can use it as signal's value.
 */
const ERRORED: any = /* @__PURE__ */ Symbol('ERRORED');

// Note: Using an IIFE here to ensure that the spread assignment is not considered
// a side-effect, ending up preserving `COMPUTED_NODE` and `REACTIVE_NODE`.
// TODO: remove when https://github.com/evanw/esbuild/issues/3392 is resolved.
const COMPUTED_NODE = /* @__PURE__ */ (() => {
  return {
    ...REACTIVE_NODE,
    value: UNSET,
    dirty: true,
    error: null,
    equal: defaultEquals,
    equalCache: null,

    producerMustRecompute(node: ComputedNode<unknown>): boolean {
      // Force a recomputation if there's no current value, or if the current value is in the
      // process of being calculated (which should throw an error).
      return node.value === UNSET || node.value === COMPUTING;
    },

    producerEquals(node: ComputedNode<unknown>, value: unknown, valueVersion: Version) {
      if (
        valueVersion + 1 === node.version || // equal is called before the version is incremented
        value === ERRORED ||
        node.value === ERRORED ||
        value === COMPUTING ||
        node.value === COMPUTING ||
        value === UNSET ||
        node.value === UNSET
      ) {
        return false;
      }
      let res = node.equalCache?.[valueVersion];
      if (res == null) {
        res = !!node.equal.call(node.wrapper, value, node.value);
        if (!node.equalCache) {
          node.equalCache = {};
        }
        node.equalCache[valueVersion] = res;
      }
      return res;
    },

    producerRecomputeValue(node: ComputedNode<unknown>): void {
      if (node.value === COMPUTING) {
        // Our computation somehow led to a cyclic read of itself.
        throw new Error('Detected cycle in computations.');
      }

      const oldValue = node.value;
      node.value = COMPUTING;

      let newValue: unknown;
      let outdatedReadVersion = true;
      let iterations = 0;
      while (outdatedReadVersion && iterations < 1000) {
        iterations++;
        const prevConsumer = consumerBeforeComputation(node);
        try {
          newValue = node.computation.call(node.wrapper);
        } catch (err) {
          newValue = ERRORED;
          node.error = err;
        } finally {
          consumerAfterComputation(node, prevConsumer);
        }
        outdatedReadVersion = consumerPollProducersForChange(node);
      }
      if (outdatedReadVersion) {
        newValue = ERRORED;
        node.error = new Error('Could not stabilize the computation.');
      }

      const canCompare = oldValue !== UNSET && oldValue !== ERRORED && newValue !== ERRORED;
      const wasEqual = canCompare && node.equal.call(node.wrapper, oldValue, newValue);

      if (wasEqual) {
        // No change to `valueVersion` - old and new values are
        // semantically equivalent.
        node.value = oldValue;
        return;
      }

      node.value = newValue;
      node.version++;
    },
  };
})();
