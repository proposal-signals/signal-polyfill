/**
 * @license
 * Copyright 2024 Bloomberg Finance L.P.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  computedGet,
  createComputed,
  type ComputedNode,
} from "./computed.js";
import { EffectNode, createEffectNode, effectExecute, shouldEffectExecute } from "./effect.js";
import {
SIGNAL,
getActiveConsumer,
isInNotificationPhase,
producerAccessed,
assertConsumerNode,
setActiveConsumer,
REACTIVE_NODE,
type ReactiveNode,
assertProducerNode,
producerRemoveLiveConsumerAtIndex,
} from "./graph.js";
import {
createSignal,
signalGetFn,
signalSetFn,
type SignalNode,
} from "./signal.js";

const NODE: unique symbol = Symbol("node");

let isState: (s: any) => boolean,
    isComputed: (s: any) => boolean,
    isEffect: (s: any) => boolean,
    isWatcher: (s: any) => boolean;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Signal {
// A read-write Signal
export class State<T> {
  readonly [NODE]: SignalNode<T>;
  #brand() {}

  static {
    isState = s => #brand in s;
  }

  constructor(initialValue: T, options: Signal.Options<T> = {}) {
    const ref = createSignal<T>(initialValue);
    const node: SignalNode<T> = ref[SIGNAL];
    this[NODE] = node;
    node.wrapper = this;
    if (options) {
      const equals = options.equals;
      if (equals) {
        node.equal = equals;
      }
      node.watched = options[Signal.subtle.watched];
      node.unwatched = options[Signal.subtle.unwatched];
    }
  }

  public get(): T {
    if (!isState(this))
      throw new TypeError(
        "Wrong receiver type for Signal.State.prototype.get",
      );
    return (signalGetFn<T>).call(this[NODE]);
  }

  public set(newValue: T): void {
    if (!isState(this))
      throw new TypeError(
        "Wrong receiver type for Signal.State.prototype.set",
      );
    if (isInNotificationPhase()) {
      throw new Error(
        "Writes to signals not permitted during Watcher callback",
      );
    }
    const ref = this[NODE];
    signalSetFn<T>(ref, newValue);
  }
}

// A Signal which is a formula based on other Signals
export class Computed<T> {
  readonly [NODE]: ComputedNode<T>;

  #brand() {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static {
    isComputed = (c: any) => #brand in c;
  }

  // Create a Signal which evaluates to the value returned by the callback.
  // Callback is called with this signal as the parameter.
  constructor(computation: () => T, options?: Signal.Options<T>) {
    const ref = createComputed<T>(computation);
    const node = ref[SIGNAL];
    node.consumerAllowSignalWrites = true;
    this[NODE] = node;
    node.wrapper = this;
    if (options) {
      const equals = options.equals;
      if (equals) {
        node.equal = equals;
      }
      node.watched = options[Signal.subtle.watched];
      node.unwatched = options[Signal.subtle.unwatched];
    }
  }

  get(): T {
    if (!isComputed(this))
      throw new TypeError(
        "Wrong receiver type for Signal.Computed.prototype.get",
      );
    return computedGet(this[NODE]);
  }
}



// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySignal<T = any> = State<T> | Computed<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySink = Computed<any> | subtle.Effect<any> | subtle.Watcher;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Watchable<T = any> = State<T> | Computed<T> | subtle.Effect<T>;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace subtle {
  // Run a callback with all tracking disabled (even for nested computed).
  export function untrack<T>(cb: () => T): T {
    let output: T;
    let prevActiveConsumer = null;
    try {
      prevActiveConsumer = setActiveConsumer(null);
      output = cb();
    } finally {
      setActiveConsumer(prevActiveConsumer);
    }
    return output;
  }

  // Returns ordered list of all signals which this one referenced
  // during the last time it was evaluated
  export function introspectSources(sink: AnySink): AnySignal[] {
    if (!isComputed(sink) && !isWatcher(sink) && !isEffect(sink)) {
      throw new TypeError(
        "Called introspectSources without a Computed or Watcher or Effect argument",
      );
    }
    return sink[NODE].producerNode?.map((n) => n.wrapper) ?? [];
  }

  // Returns the subset of signal sinks which recursively
  // lead to an Effect which has not been disposed
  // Note: Only watched Computed signals will be in this list.
  export function introspectSinks(signal: Watchable): AnySink[] {
    if (!isComputed(signal) && !isState(signal) && !isEffect(signal)) {
      throw new TypeError("Called introspectSinks without a Signal or Effect argument");
    }
    return signal[NODE].liveConsumerNode?.map((n) => n.wrapper) ?? [];
  }

  // True iff introspectSinks() is non-empty
  export function hasSinks(signal: Watchable): boolean {
    if (!isComputed(signal) && !isState(signal) && !isEffect(signal)) {
      throw new TypeError("Called hasSinks without a Signal or Effect argument");
    }
    const liveConsumerNode = signal[NODE].liveConsumerNode;
    if (!liveConsumerNode) return false;
    return liveConsumerNode.length > 0;
  }

  // True iff introspectSources() is non-empty
  export function hasSources(signal: AnySink): boolean {
    if (!isComputed(signal) && !isWatcher(signal) && !isEffect(signal)) {
      throw new TypeError("Called hasSources without a Computed or Watcher or Effect argument");
    }
    const producerNode = signal[NODE].producerNode;
    if (!producerNode) return false;
    return producerNode.length > 0;
  } 
  
  // A function which performs side effects in response to changes in Signals
  export class Effect<T> {
    readonly [NODE]: EffectNode<T>;

    #brand() {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static {
      isEffect = (c: any) => #brand in c;
    }

    // Create an Effect which evaluates some code in a reactive context.
    constructor(executeEffect: () => T) {
      const node = createEffectNode<T>(executeEffect);
      node.consumerAllowSignalWrites = true;
      this[NODE] = node;
      node.wrapper = this;
    }

    // Execute the effect, and return its result
    execute(): T {
      if (!isEffect(this))
        throw new TypeError(
          "Wrong receiver type for Signal.subtle.Effect.prototype.execute"
        );
      return effectExecute(this[NODE]);
    }

    // Returns true if the effect has never been run before, or if any of its
    // sources have changed since the last time it was run.
    shouldExecute(): boolean {
      if (!isEffect(this))
        throw new TypeError(
          "Wrong receiver type for Signal.subtle.Effect.prototype.shouldExecute"
        );
      return shouldEffectExecute(this[NODE]);
    }
  }

  export class Watcher {
    readonly [NODE]: ReactiveNode;

    #brand() {}
    static {
      isWatcher = (w: any): w is Watcher => #brand in w;
    }

    // When a (recursive) source of Watcher is written to, call this callback,
    // if it hasn't already been called since the last `watch` call.
    // No signals may be read or written during the notify.
    constructor(notify: (this: Watcher) => void) {
      let node = Object.create(REACTIVE_NODE);
      node.wrapper = this;
      node.consumerMarkedDirty = notify;
      node.consumerIsAlwaysLive = true;
      node.consumerAllowSignalWrites = false;
      node.producerNode = [];
      this[NODE] = node;
    }

    #assertWatchable(items: Watchable[]): void {
      for (const item of items) {
        if (!isComputed(item) && !isState(item) && !isEffect(item)) {
          throw new TypeError(
            "Called watch/unwatch without a Computed or State argument",
          );
        }
      }
    }

    // Add these signals to the Watcher's set, and set the watcher to run its
    // notify callback next time any signal in the set (or one of its dependencies) changes.
    // Can be called with no arguments just to reset the "notified" state, so that
    // the notify callback will be invoked again.
    watch(...items: Watchable[]): void {
      if (!isWatcher(this)) {
        throw new TypeError("Called unwatch without Watcher receiver");
      }
      this.#assertWatchable(items);

      const node = this[NODE];
      node.dirty = false;  // Give the watcher a chance to trigger again
      const prev = setActiveConsumer(node);
      try {
        // producerAccessed will throw if called during the notify phase
        for (const signal of items) {
          producerAccessed(signal[NODE]);
        }
      } finally {
        setActiveConsumer(prev);
      }
    }

    // Remove these signals from the watched set (e.g., for an effect which is disposed)
    unwatch(...items: Watchable[]): void {
      if (!isWatcher(this)) {
        throw new TypeError("Called unwatch without Watcher receiver");
      }
      this.#assertWatchable(items);

      const node = this[NODE];
      assertConsumerNode(node);

      let indicesToShift = [];
      for (let i = 0; i < node.producerNode.length; i++) {
          if (items.includes(node.producerNode[i].wrapper)) {
            producerRemoveLiveConsumerAtIndex(node.producerNode[i], node.producerIndexOfThis[i]);
            indicesToShift.push(i);
          }
      }
      for (const idx of indicesToShift) {
        // Logic copied from producerRemoveLiveConsumerAtIndex, but reversed
        const lastIdx = node.producerNode!.length - 1;
        node.producerNode![idx] = node.producerNode![lastIdx];
        node.producerIndexOfThis[idx] = node.producerIndexOfThis[lastIdx];

        node.producerNode.length--;
        node.producerIndexOfThis.length--;
        node.nextProducerIndex--;

        if (idx < node.producerNode.length) {
          const idxConsumer = node.producerIndexOfThis[idx];
          const producer = node.producerNode[idx];
          assertProducerNode(producer);
          producer.liveConsumerIndexOfThis[idxConsumer] = idx;
        }
      }
    }

    // Returns the set of computeds in the Watcher's set which are still yet
    // to be re-evaluated
    getPending(): Computed<any>[] {
      if (!isWatcher(this)) {
        throw new TypeError("Called getPending without Watcher receiver");
      }
      const node = this[NODE];
      return node.producerNode!.filter((n) => n.dirty).map((n) => n.wrapper);
    }
  }

  export function currentComputed(): Computed<any> | undefined {
    return getActiveConsumer()?.wrapper;
  }

  // Hooks to observe being watched or no longer watched
  export const watched = Symbol("watched");
  export const unwatched = Symbol("unwatched");
}

export interface Options<T> {
  // Custom comparison function between old and new value. Default: Object.is.
  // The signal is passed in as an optionally-used third parameter for context.
  equals?: (this: AnySignal<T>, t: T, t2: T) => boolean;

  // Callback called when hasSinks becomes true, if it was previously false
  [Signal.subtle.watched]?: (this: AnySignal<T>) => void;

  // Callback called whenever hasSinks becomes false, if it was previously true
  [Signal.subtle.unwatched]?: (this: AnySignal<T>) => void;
}
}
