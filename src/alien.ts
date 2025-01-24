import * as alien from 'alien-signals';

export namespace Signal {
  const WATCHER_PLACEHOLDER = Symbol('watcher') as any;

  const {
    endTracking,
    link,
    propagate,
    startTracking,
    processComputedUpdate,
    processEffectNotifications,
  } = alien.createReactiveSystem({
    updateComputed(computed: Computed) {
      return computed.update();
    },
    notifyEffect(watcher: subtle.Watcher) {
      if (watcher.flags & alien.SubscriberFlags.Dirty) {
        watcher.run();
        return true;
      }
      return false;
    },
  });
  const nursery: alien.Subscriber = {
    flags: alien.SubscriberFlags.None,
    deps: undefined,
    depsTail: undefined,
  };

  let triggingCooling = false;
  let activeSub: alien.Subscriber | undefined;

  export function untrack<T>(fn: () => T) {
    const prevSub = activeSub;
    activeSub = undefined;
    try {
      return fn();
    } finally {
      activeSub = prevSub;
    }
  }

  export class State<T = any> implements alien.Dependency {
    subs: alien.Link | undefined = undefined;
    subsTail: alien.Link | undefined = undefined;
    version = 0;
    watchCount = 0;

    constructor(
      private currentValue: T,
      private options?: Options<T>,
    ) {
      if (options?.equals !== undefined) {
        this.equals = options.equals;
      }
    }

    equals(t: T, t2: T): boolean {
      return Object.is(t, t2);
    }

    onWatched() {
      if (this.watchCount++ === 0) {
        this.options?.[subtle.watched]?.call(this);
      }
    }

    onUnwatched() {
      if (--this.watchCount === 0) {
        this.options?.[subtle.unwatched]?.call(this);
      }
    }

    get() {
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot read from state inside watcher');
      }
      if (activeSub !== undefined) {
        if (link(this, activeSub)) {
          const newSub = this.subsTail!.sub;
          if (newSub instanceof Computed && newSub.watchCount) {
            this.onWatched();
          }
        }
      }
      return this.currentValue;
    }

    set(value: T): void {
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot write to state inside watcher');
      }
      if (!this.equals(this.currentValue, value)) {
        this.version++;
        this.currentValue = value;
        const subs = this.subs;
        if (subs !== undefined) {
          propagate(subs);
          processEffectNotifications();
        }
      }
    }
  }

  export class Computed<T = any> implements alien.Dependency, alien.Subscriber {
    subs: alien.Link | undefined = undefined;
    subsTail: alien.Link | undefined = undefined;
    deps: alien.Link | undefined = undefined;
    depsTail: alien.Link | undefined = undefined;
    flags = alien.SubscriberFlags.Computed | alien.SubscriberFlags.Dirty;
    isError = true;
    version = 0;
    watchCount = 0;
    currentValue: T | undefined = undefined;

    constructor(
      private getter: () => T,
      private options?: Options<T>,
    ) {
      if (options?.equals !== undefined) {
        this.equals = options.equals;
      }
    }

    equals(t: T, t2: T): boolean {
      return Object.is(t, t2);
    }

    onWatched() {
      if (this.watchCount++ === 0) {
        this.options?.[subtle.watched]?.call(this);
        for (let link = this.deps; link !== undefined; link = link.nextDep) {
          const dep = link.dep as AnySignal;
          dep.onWatched();
        }
      }
    }

    onUnwatched() {
      if (--this.watchCount === 0) {
        this.options?.[subtle.unwatched]?.call(this);
        for (let link = this.deps; link !== undefined; link = link.nextDep) {
          const dep = link.dep as AnySignal;
          dep.onUnwatched();
        }
      }
    }

    get() {
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot read from computed inside watcher');
      }
      const flags = this.flags;
      if (flags & alien.SubscriberFlags.Tracking) {
        throw new Error('Cycles detected');
      }
      if (flags & (alien.SubscriberFlags.Dirty | alien.SubscriberFlags.PendingComputed)) {
        processComputedUpdate(this, flags);
      }
      if (activeSub !== undefined) {
        const newSub = link(this, activeSub)?.sub;
        if (newSub instanceof Computed && newSub.watchCount) {
          this.onWatched();
        }
      } else if (this.subs === undefined) {
        link(this, nursery);
        if (!triggingCooling) {
          triggingCooling = true;
          triggerCooling();
        }
      }
      if (this.isError) {
        throw this.currentValue;
      }
      return this.currentValue!;
    }

    update(): boolean {
      const prevSub = activeSub;
      activeSub = this;
      startTracking(this);
      const oldValue = this.currentValue;
      try {
        const newValue = this.getter();
        if (this.isError || !this.equals(oldValue!, newValue)) {
          this.isError = false;
          this.version++;
          this.currentValue = newValue;
          return true;
        }
        return false;
      } catch (err) {
        if (!this.isError || !this.equals(oldValue!, err as any)) {
          this.isError = true;
          this.version++;
          this.currentValue = err as any;
          return true;
        }
        return false;
      } finally {
        if (this.watchCount) {
          for (
            let link = this.depsTail !== undefined ? this.depsTail.nextDep : this.deps;
            link !== undefined;
            link = link.nextDep
          ) {
            const dep = link.dep as AnySignal;
            dep.onUnwatched();
          }
        }
        activeSub = prevSub;
        endTracking(this);
      }
    }
  }

  async function triggerCooling() {
    await Promise.resolve(); // TODO: Confirm the scheduling logic
    triggingCooling = false;
    startTracking(nursery);
    endTracking(nursery);
  }

  type AnySignal<T = any> = State<T> | Computed<T>;

  export namespace subtle {
    export class Watcher implements alien.Subscriber {
      deps: alien.Link | undefined = undefined;
      depsTail: alien.Link | undefined = undefined;
      flags = alien.SubscriberFlags.Effect;
      watchList = new Set<AnySignal>();

      constructor(private fn: () => void) {}

      run() {
        const prevSub = activeSub;
        activeSub = WATCHER_PLACEHOLDER;
        try {
          this.fn();
        } finally {
          activeSub = prevSub;
        }
      }

      watch(...signals: AnySignal[]): void {
        for (const signal of signals) {
          if (this.watchList.has(signal)) {
            continue;
          }
          this.watchList.add(signal);
          link(signal, this);
          signal.onWatched();
        }
      }

      unwatch(...signals: AnySignal[]): void {
        for (const signal of signals) {
          if (!this.watchList.has(signal)) {
            continue;
          }
          this.watchList.delete(signal);
          signal.onUnwatched();
        }
        startTracking(this);
        for (let _link = this.deps; _link !== undefined; _link = _link.nextDep) {
          const dep = _link.dep as AnySignal;
          if (this.watchList.has(dep)) {
            link(dep, this);
          }
        }
        endTracking(this);
      }

      getPending() {
        const arr: AnySignal[] = [];
        for (let link = this.deps; link !== undefined; link = link.nextDep) {
          const source = link.dep;
          if (
            source instanceof Computed &&
            source.flags & (alien.SubscriberFlags.PendingComputed | alien.SubscriberFlags.Dirty)
          ) {
            arr.push(link.dep as AnySignal);
          }
        }
        return arr;
      }
    }

    export function hasSinks(signal: AnySignal) {
      return signal.watchCount > 0;
    }

    export function introspectSinks(signal: AnySignal) {
      const arr: (Computed | subtle.Watcher)[] = [];
      for (let link = signal.subs; link !== undefined; link = link.nextSub) {
        arr.push(link.sub as Computed | subtle.Watcher);
      }
      return arr;
    }

    export function introspectSources(signal: alien.Subscriber) {
      const arr: AnySignal[] = [];
      for (let link = signal.deps; link !== undefined; link = link.nextDep) {
        arr.push(link.dep as AnySignal);
      }
      return arr;
    }

    // Hooks to observe being watched or no longer watched
    export const watched = Symbol('watched');
    export const unwatched = Symbol('unwatched');
  }

  export interface Options<T> {
    // Custom comparison function between old and new value. Default: Object.is.
    // The signal is passed in as an optionally-used third parameter for context.
    equals?: (this: AnySignal, t: T, t2: T) => boolean;

    // Callback called when hasSinks becomes true, if it was previously false
    [subtle.watched]?: (this: AnySignal) => void;

    // Callback called whenever hasSinks becomes false, if it was previously true
    [subtle.unwatched]?: (this: AnySignal) => void;
  }
}
