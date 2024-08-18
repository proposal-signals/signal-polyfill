import {REACTIVE_NODE, type ReactiveNode, producerAccessed} from './graph';

/**
 * Volatile functions read from external sources. They can change at any time
 * without notifying the graph. If the source supports it, optionally we can
 * subscribe to changes while observed.
 *
 * Unless the external source is actively being observed, we have to assume
 * it's stale and bust the cache of everything downstream.
 */
export function createVolatile<T>(getSnapshot: () => T): VolatileNode<T> {
  const node: VolatileNode<T> = Object.create(REACTIVE_NODE);
  node.getSnapshot = getSnapshot;

  return node;
}

export function volatileGetFn<T>(this: VolatileNode<T>): T {
  producerAccessed(this);

  // TODO:
  // - Cache when live.
  // - Handle errors in live snapshots.
  // - Throw if dependencies are used in the snapshot.
  // - Bust downstream caches when not live.
  return this.getSnapshot();
}

export interface VolatileNode<T> extends ReactiveNode {
  /** Read state from the outside world. May be expensive. */
  getSnapshot: () => T;
}
