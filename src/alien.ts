import * as alien from 'alien-signals';

export namespace Signal {
  const WATCHER_PLACEHOLDER = Symbol('watcher') as any;

  const {
    link,
    propagate,
    checkDirty,
    endTracking,
    startTracking,
    processComputedUpdate,
    processEffectNotifications,
  } = alien.pullmodel.createReactiveSystem({
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
    shouldCheckDirty(computed: Computed) {
      if (computed.globalVersion !== globalVersion) {
        computed.globalVersion = globalVersion;
        return true;
      }
      return false;
    },
    onWatched(dep: AnySignal) {
      dep.options?.[subtle.watched]?.call(dep);
    },
    onUnwatched(dep: AnySignal) {
      dep.options?.[subtle.unwatched]?.call(dep);
    },
  });

  let globalVersion = 0;
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
    version = 0;
    subs: alien.Link | undefined = undefined;
    subsTail: alien.Link | undefined = undefined;

    constructor(
      private currentValue: T,
      public options?: Options<T>,
    ) {
      if (options?.equals !== undefined) {
        this.equals = options.equals;
      }
    }

    equals(t: T, t2: T): boolean {
      return Object.is(t, t2);
    }

    get() {
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot read from state inside watcher');
      }
      if (activeSub !== undefined) {
        link(this, activeSub);
      }
      return this.currentValue;
    }

    set(value: T): void {
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot write to state inside watcher');
      }
      if (!this.equals(this.currentValue, value)) {
        globalVersion++;
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

  const ErrorFlag = 1 << 8;

  export class Computed<T = any> implements alien.Dependency, alien.Subscriber {
    subs: alien.Link | undefined = undefined;
    subsTail: alien.Link | undefined = undefined;
    deps: alien.Link | undefined = undefined;
    depsTail: alien.Link | undefined = undefined;
    flags = alien.SubscriberFlags.Computed | alien.SubscriberFlags.Dirty | ErrorFlag;
    currentValue: T | undefined = undefined;
    version = 0;
    globalVersion = globalVersion;

    constructor(
      private getter: () => T,
      public options?: Options<T>,
    ) {
      if (options?.equals !== undefined) {
        this.equals = options.equals;
      }
    }

    equals(t: T, t2: T): boolean {
      return Object.is(t, t2);
    }

    get() {
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot read from computed inside watcher');
      }
      const flags = this.flags;
      if (flags & alien.SubscriberFlags.Tracking) {
        throw new Error('Cycles detected');
      }
      if (flags & alien.SubscriberFlags.Dirty) {
        processComputedUpdate(this, flags);
      } else if (this.subs === undefined) {
        if (this.globalVersion !== globalVersion) {
          this.globalVersion = globalVersion;
          const deps = this.deps;
          if (deps !== undefined && checkDirty(deps)) {
            this.update();
          }
        }
      } else if (flags & alien.SubscriberFlags.PendingComputed) {
        processComputedUpdate(this, flags);
      }
      if (activeSub !== undefined) {
        link(this, activeSub);
      }
      if (this.flags & ErrorFlag) {
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
        if (this.flags & ErrorFlag || !this.equals(oldValue!, newValue)) {
          this.version++;
          this.flags &= ~ErrorFlag;
          this.currentValue = newValue;
          return true;
        }
        return false;
      } catch (err) {
        if (!(this.flags & ErrorFlag) || !this.equals(oldValue!, err as any)) {
          this.version++;
          this.flags |= ErrorFlag;
          this.currentValue = err as any;
          return true;
        }
        return false;
      } finally {
        activeSub = prevSub;
        endTracking(this);
      }
    }
  }

  type AnySignal<T = any> = State<T> | Computed<T>;

  export namespace subtle {
    export class Watcher implements alien.Subscriber {
      deps: alien.Link | undefined = undefined;
      depsTail: alien.Link | undefined = undefined;
      flags = alien.SubscriberFlags.Effect;

      constructor(private fn: () => void) { }

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
          link(signal, this);
        }
      }

      unwatch(...signals: AnySignal[]): void {
        startTracking(this);
        for (let _link = this.deps; _link !== undefined; _link = _link.nextDep) {
          const dep = _link.dep as AnySignal;
          if (!signals.includes(dep)) {
            link(dep, this);
          }
        }
        endTracking(this);
      }

      getPending() {
        return introspectSources(this).filter(
          (source) =>
            source instanceof Computed &&
            source.flags & (alien.SubscriberFlags.PendingComputed | alien.SubscriberFlags.Dirty),
        );
      }
    }

    export function hasSinks(signal: AnySignal) {
      return signal.subs !== undefined;
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
