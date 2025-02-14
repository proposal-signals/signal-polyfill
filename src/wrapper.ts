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
  ComputedNode,
  untrack as graphUntrack,
  getActiveConsumer,
  isInNotificationPhase,
  SignalNode,
  WatcherNode,
} from './graph';

const NODE: unique symbol = Symbol('node');

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Signal {
  export let isState: (s: any) => boolean,
    isComputed: (s: any) => boolean,
    isWatcher: (s: any) => boolean;

  // A read-write Signal
  export class State<T> {
    readonly [NODE]: SignalNode<T>;
    #brand() {}

    static {
      isState = (s) => typeof s === 'object' && #brand in s;
    }

    constructor(initialValue: T, options: Signal.Options<T> = {}) {
      const node = new SignalNode<T>(initialValue);
      this[NODE] = node;
      node.wrapper = this;
      if (options) {
        const equals = options.equals;
        if (equals) {
          node.equalFn = equals;
        }
        node.watchedFn = options[Signal.subtle.watched];
        node.unwatchedFn = options[Signal.subtle.unwatched];
      }
    }

    public get(): T {
      if (!isState(this)) throw new TypeError('Wrong receiver type for Signal.State.prototype.get');
      return this[NODE].get();
    }

    public set(newValue: T): void {
      if (!isState(this)) throw new TypeError('Wrong receiver type for Signal.State.prototype.set');
      if (isInNotificationPhase()) {
        throw new Error('Writes to signals not permitted during Watcher callback');
      }
      this[NODE].set(newValue);
    }
  }

  // A Signal which is a formula based on other Signals
  export class Computed<T> {
    readonly [NODE]: ComputedNode<T>;

    #brand() {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static {
      isComputed = (c: any) => typeof c === 'object' && #brand in c;
    }

    // Create a Signal which evaluates to the value returned by the callback.
    // Callback is called with this signal as the parameter.
    constructor(computation: () => T, options?: Signal.Options<T>) {
      const node = new ComputedNode<T>(computation);
      this[NODE] = node;
      node.wrapper = this;
      if (options) {
        const equals = options.equals;
        if (equals) {
          node.equalFn = equals;
        }
        node.watchedFn = options[Signal.subtle.watched];
        node.unwatchedFn = options[Signal.subtle.unwatched];
      }
    }

    get(): T {
      if (!isComputed(this))
        throw new TypeError('Wrong receiver type for Signal.Computed.prototype.get');
      return this[NODE].get();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySignal<T = any> = State<T> | Computed<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySink = Computed<any> | subtle.Watcher;

  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace subtle {
    // Run a callback with all tracking disabled (even for nested computed).
    export const untrack = graphUntrack;

    // Returns ordered list of all signals which this one referenced
    // during the last time it was evaluated
    export function introspectSources(sink: AnySink): AnySignal[] {
      if (!isComputed(sink) && !isWatcher(sink)) {
        throw new TypeError('Called introspectSources without a Computed or Watcher argument');
      }
      return [...sink[NODE].producers.keys()].map((n) => n.wrapper) ?? [];
    }

    // Returns the subset of signal sinks which recursively
    // lead to an Effect which has not been disposed
    // Note: Only watched Computed signals will be in this list.
    export function introspectSinks(signal: AnySignal): AnySink[] {
      if (!isComputed(signal) && !isState(signal)) {
        throw new TypeError('Called introspectSinks without a Signal argument');
      }
      return [...signal[NODE].consumers.keys()].map((n) => n.wrapper) ?? [];
    }

    // True iff introspectSinks() is non-empty
    export function hasSinks(signal: AnySignal): boolean {
      if (!isComputed(signal) && !isState(signal)) {
        throw new TypeError('Called hasSinks without a Signal argument');
      }
      const liveConsumerNode = signal[NODE].consumers;
      if (!liveConsumerNode) return false;
      return liveConsumerNode.size > 0;
    }

    // True iff introspectSources() is non-empty
    export function hasSources(signal: AnySink): boolean {
      if (!isComputed(signal) && !isWatcher(signal)) {
        throw new TypeError('Called hasSources without a Computed or Watcher argument');
      }
      const producerNode = signal[NODE].producers;
      if (!producerNode) return false;
      return producerNode.size > 0;
    }

    export class Watcher {
      readonly [NODE]: WatcherNode;

      #brand() {}
      static {
        isWatcher = (w: any): w is Watcher => #brand in w;
      }

      // When a (recursive) source of Watcher is written to, call this callback,
      // if it hasn't already been called since the last `watch` call.
      // No signals may be read or written during the notify.
      constructor(notify: (this: Watcher) => void) {
        const node = new WatcherNode(notify);
        node.wrapper = this;
        this[NODE] = node;
      }

      #assertSignals(signals: AnySignal[]): void {
        for (const signal of signals) {
          if (!isComputed(signal) && !isState(signal)) {
            throw new TypeError('Called watch/unwatch without a Computed or State argument');
          }
        }
      }

      // Add these signals to the Watcher's set, and set the watcher to run its
      // notify callback next time any signal in the set (or one of its dependencies) changes.
      // Can be called with no arguments just to reset the "notified" state, so that
      // the notify callback will be invoked again.
      watch(...signals: AnySignal[]): void {
        if (!isWatcher(this)) {
          throw new TypeError('Called unwatch without Watcher receiver');
        }
        this.#assertSignals(signals);

        const node = this[NODE];
        node.dirty = false; // Give the watcher a chance to trigger again
        for (const signal of signals) {
          signal[NODE].registerConsumer(node);
        }
      }

      // Remove these signals from the watched set (e.g., for an effect which is disposed)
      unwatch(...signals: AnySignal[]): void {
        if (!isWatcher(this)) {
          throw new TypeError('Called unwatch without Watcher receiver');
        }
        this.#assertSignals(signals);

        const node = this[NODE];
        for (const signal of signals) {
          signal[NODE].unregisterConsumer(node);
        }
      }

      // Returns the set of computeds in the Watcher's set which are still yet
      // to be re-evaluated
      getPending(): Computed<any>[] {
        if (!isWatcher(this)) {
          throw new TypeError('Called getPending without Watcher receiver');
        }
        const node = this[NODE];
        return [...node.producers.keys()]
          .filter((n) => n instanceof ComputedNode && n.dirty)
          .map((n) => n.wrapper);
      }
    }

    export function currentComputed(): Computed<any> | undefined {
      return getActiveConsumer()?.wrapper;
    }

    // Hooks to observe being watched or no longer watched
    export const watched = Symbol('watched');
    export const unwatched = Symbol('unwatched');
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
