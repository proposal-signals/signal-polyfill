import * as alien from 'alien-signals';

const WATCHER_PLACEHOLDER = Symbol('watcher') as any;

export namespace Signal {
  const {drainQueuedEffects, endTrack, isDirty, link, propagate, shallowPropagate, startTrack} =
    alien.createSystem({
      isComputed(sub): sub is Computed {
        return sub instanceof Computed;
      },
      isEffect(sub): sub is subtle.Watcher {
        return sub instanceof subtle.Watcher;
      },
      notifyEffect(watcher) {
        watcher.notify();
      },
      updateComputed(computed) {
        return computed.update();
      },
    });

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
    watchCount = 0;

    constructor(
      private currentValue: T,
      private options?: Options<T>,
    ) {
      if (options && options.equals) {
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
      if (activeSub !== undefined && link(this, activeSub)) {
        const newSub = this.subsTail!;
        if (newSub instanceof Computed && newSub.watchCount) {
          this.onWatched();
        }
      }
      return this.currentValue;
    }

    set(value: T): void {
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot write to state inside watcher');
      }
      if (!this.equals(this.currentValue, value)) {
        this.currentValue = value;
        const subs = this.subs;
        if (subs !== undefined) {
          propagate(subs);
          drainQueuedEffects();
        }
      }
    }
  }

  export class Computed<T = any> implements alien.Dependency, alien.Subscriber {
    subs: alien.Link | undefined = undefined;
    subsTail: alien.Link | undefined = undefined;
    deps: alien.Link | undefined = undefined;
    depsTail: alien.Link | undefined = undefined;
    flags = alien.SubscriberFlags.Dirty;
    isError = true;
    watchCount = 0;
    currentValue: T | undefined = undefined;

    constructor(
      private getter: () => T,
      private options?: Options<T>,
    ) {
      if (options && options.equals) {
        this.equals = options.equals;
      }
    }

    equals(t: T, t2: T): boolean {
      return Object.is(t, t2);
    }

    onWatched() {
      if (this.watchCount++ === 0) {
        this.options?.[subtle.watched]?.call(this);
        let link = this.deps;
        while (link) {
          const dep = link.dep as AnySignal;
          dep.onWatched();
          link = link.nextDep;
        }
      }
    }

    onUnwatched() {
      if (--this.watchCount === 0) {
        this.options?.[subtle.unwatched]?.call(this);
        let link = this.deps;
        while (link) {
          const dep = link.dep as AnySignal;
          dep.onUnwatched();
          link = link.nextDep;
        }
      }
    }

    get() {
      if (this.flags & alien.SubscriberFlags.Tracking) {
        throw new Error('Cycles detected');
      }
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot read from computed inside watcher');
      }

      if (isDirty(this, this.flags)) {
        if (this.update()) {
          const subs = this.subs;
          if (subs !== undefined) {
            shallowPropagate(subs);
          }
        }
      }
      if (activeSub !== undefined && link(this, activeSub)) {
        const newSub = this.subsTail!;
        if (newSub instanceof Computed && newSub.watchCount) {
          this.onWatched();
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
      startTrack(this);
      const oldValue = this.currentValue;
      try {
        const newValue = this.getter();
        if (this.isError || !this.equals(oldValue!, newValue)) {
          this.isError = false;
          this.currentValue = newValue;
          return true;
        }
        return false;
      } catch (err) {
        if (!this.isError || !this.equals(oldValue!, err as any)) {
          this.isError = true;
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
        endTrack(this);

        if (this.watchCount) {
          for (let link = this.deps; link !== undefined; link = link.nextDep) {
            const dep = link.dep as AnySignal;
            dep.onWatched();
          }
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySignal<T = any> = State<T> | Computed<T>;

  export namespace subtle {
    export class Watcher implements alien.Subscriber {
      deps: alien.Link | undefined = undefined;
      depsTail: alien.Link | undefined = undefined;
      flags = alien.SubscriberFlags.None;
      watchList = new Set<AnySignal>();

      constructor(private fn: () => void) {}

      notify() {
        if (this.flags & alien.SubscriberFlags.Dirty) {
          this.run();
        }
      }

      run() {
        this.flags = alien.SubscriberFlags.None;
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
        this.flags = alien.SubscriberFlags.None;
      }

      unwatch(...signals: AnySignal[]): void {
        for (const signal of signals) {
          if (!this.watchList.has(signal)) {
            continue;
          }
          this.watchList.delete(signal);
          signal.onUnwatched();
        }
        startTrack(this);
        for (let dep = this.deps; dep !== undefined; dep = dep.nextDep) {
          if (this.watchList.has(dep.dep as AnySignal)) {
            link(dep.dep, this);
          }
        }
        endTrack(this);
      }

      getPending() {
        return introspectSources(this).filter(
          (source) =>
            source instanceof Computed &&
            source.flags & (alien.SubscriberFlags.ToCheckDirty | alien.SubscriberFlags.Dirty),
        );
      }
    }

    export function hasSinks(signal: AnySignal) {
      return signal.watchCount > 0;
    }

    export function introspectSinks(signal: AnySignal) {
      const arr: (Computed | subtle.Watcher)[] = [];
      for (let sub = signal.subs; sub !== undefined; sub = sub.nextSub) {
        arr.push(sub.sub as Computed | subtle.Watcher);
      }
      return arr;
    }

    export function introspectSources(signal: alien.Subscriber) {
      const arr: AnySignal[] = [];
      for (let dep = signal.deps; dep !== undefined; dep = dep.nextDep) {
        arr.push(dep.dep as AnySignal);
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
