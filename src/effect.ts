/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {
  REACTIVE_NODE,
  ReactiveNode,
  consumerAfterComputation,
  consumerBeforeComputation,
  consumerMarkClean,
  isInNotificationPhase,
  producerUpdateValueVersion,
} from "./graph.js";

/**
 * A computation, which derives a value from a declarative reactive expression.
 *
 * `Effects`s are only consumers of reactivity.
 */
export interface EffectNode<T> extends ReactiveNode {
  /**
   * The computation function which will produce a new value.
   */
  executeEffect: () => T;
}

export function effectExecute<T>(node: EffectNode<T>): T {
  if (isInNotificationPhase()) {
    throw new Error(
      "Effects cannot be executed during the notification phase."
    );
  }
  const prevConsumer = consumerBeforeComputation(node);
  try {
    return node.executeEffect();
  } finally {
    consumerAfterComputation(node, prevConsumer);
    // Even if the effect throws, mark it as clean.
    consumerMarkClean(node);
    if (!node?.producerNode?.length) {
      throw new Error("Effects must consume at least one Signal.");
    }
  }
}

export function shouldEffectExecute<T>(node: EffectNode<T>): boolean {
  if (!node.producerNode) return true;
  for (let i = 0; i < node.producerNode.length; i++) {
    producerUpdateValueVersion(node.producerNode[i]);
    if (node.producerLastReadVersion?.[i] !== node.producerNode[i].version) {
      return true;
    }
  }
  return false;
}

/**
 * Create a computed signal which derives a reactive value from an expression.
 */
export function createEffectNode<T>(executeEffect: () => T): EffectNode<T> {
  const node: EffectNode<T> = Object.create(EFFECT_NODE);
  node.executeEffect = executeEffect;
  return node;
}

// Note: Using an IIFE here to ensure that the spread assignment is not considered
// a side-effect, ending up preserving `EFFECT_NODE` and `REACTIVE_NODE`.
// TODO: remove when https://github.com/evanw/esbuild/issues/3392 is resolved.
const EFFECT_NODE = /* @__PURE__ */ (() => {
  return {
    ...REACTIVE_NODE,
    dirty: true,
    executeEffect: () => {},
  };
})();
