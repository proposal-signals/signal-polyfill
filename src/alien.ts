import * as alien from 'alien-signals';

const WATCHER_TRACK_ID = -1;

export namespace Signal {
  export const untrack = alien.untrack;

  export function batch<T>(fn: () => T): T {
    alien.startBatch();
    try {
      return fn();
    } finally {
      alien.endBatch();
    }
  }

  export class State<T = any> extends alien.Signal<T> {
    watchCount = 0;

    constructor(
      value: T,
      private options?: Options<T>,
    ) {
      super(value);
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
      if (alien.activeTrackId === WATCHER_TRACK_ID) {
        throw new Error('Cannot read from state inside watcher');
      }
      const lastSub = this.subsTail;
      const value = super.get();
      const newSub = this.subsTail;
      if (lastSub !== newSub && newSub instanceof Computed && newSub.watchCount) {
        this.onWatched();
      }
      return value;
    }

    set(value: T): void {
      if (alien.activeTrackId === WATCHER_TRACK_ID) {
        throw new Error('Cannot write to state inside watcher');
      }
      if (!this.equals(this.currentValue, value)) {
        this.currentValue = value;
        const subs = this.subs;
        if (subs !== undefined) {
          alien.propagate(subs);
        }
      }
    }
  }

  export class Computed<T = any> extends alien.Computed<T> {
    isError = true;
    watchCount = 0;

    constructor(
      getter: () => T,
      private options?: Options<T>,
    ) {
      super(getter);
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
      if (alien.activeTrackId === WATCHER_TRACK_ID) {
        throw new Error('Cannot read from computed inside watcher');
      }
      const lastSub = this.subsTail;
      const value = super.get();
      const newSub = this.subsTail;
      if (lastSub !== newSub && newSub instanceof Computed && newSub.watchCount) {
        this.onWatched();
      }
      if (this.isError) {
        throw value;
      }
      return value;
    }

    update(): boolean {
      const prevSub = alien.activeSub;
      const prevTrackId = alien.activeTrackId;
      alien.setActiveSub(this, alien.nextTrackId());
      alien.startTrack(this);
      try {
        const oldValue = this.currentValue;
        const newValue = this.getter(oldValue);
        if (this.isError || !this.equals(oldValue!, newValue)) {
          this.isError = false;
          this.currentValue = newValue;
          return true;
        }
        return false;
      } catch (err) {
        this.isError = true;
        this.currentValue = err as any;
        return true;
      } finally {
        let removeDeps!: AnySignal[];
        if (this.watchCount) {
          removeDeps = [];
          let link = this.depsTail ? this.depsTail.nextDep : this.deps;
          while (link) {
            const dep = link.dep as AnySignal;
            removeDeps.push(dep);
            link = link.nextDep;
          }
        }
        alien.setActiveSub(prevSub, prevTrackId);
        alien.endTrack(this);
        if (this.watchCount) {
          for (const dep of removeDeps) {
            dep.onUnwatched();
          }
          let link = this.deps;
          while (link) {
            const dep = link.dep as AnySignal;
            dep.onWatched();
            link = link.nextDep;
          }
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySignal<T = any> = State<T> | Computed<T>;

  export namespace subtle {
    export class Watcher extends alien.Effect {
      constructor(fn: () => void) {
        super(fn);
      }

      run() {
        this.flags = alien.SubscriberFlags.None;
        const prevSub = alien.activeSub;
        const prevTrackId = alien.activeTrackId;
        alien.setActiveSub(undefined, WATCHER_TRACK_ID);
        try {
          this.fn();
        } finally {
          alien.setActiveSub(prevSub, prevTrackId);
        }
      }

      watch(...signals: AnySignal[]): void {
        for (const signal of signals) {
          alien.link(signal, this);
          signal.onWatched();
        }
        this.flags = alien.SubscriberFlags.None;
      }

      unwatch(...signals: AnySignal[]): void {
        alien.startTrack(this);
        let dep = this.deps;
        while (dep) {
          if (!signals.includes(dep.dep as AnySignal)) {
            alien.link(dep.dep, this);
          }
          dep = dep.nextDep;
        }
        for (const signal of signals) {
          signal.onUnwatched();
        }
        alien.endTrack(this);
      }

      getPending() {
        return introspectSources(this).filter(
          (source) =>
            source instanceof Computed &&
            source.flags & (alien.SubscriberFlags.ToCheckDirty | alien.SubscriberFlags.Dirty),
        );
      }
    }

    export function introspectSources(signal: alien.Subscriber) {
      const arr: AnySignal[] = [];
      let dep = signal.deps;
      while (dep) {
        arr.push(dep.dep as AnySignal);
        dep = dep.nextDep;
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
