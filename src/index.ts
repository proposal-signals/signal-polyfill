import {createReactiveSystem, type Link, ReactiveFlags, type ReactiveNode} from './system';

export namespace Signal {
  export let isState: (s: any) => s is State<any>,
    isComputed: (s: any) => s is Computed<any>,
    isWatcher: (s: any) => s is subtle.Watcher;

  const WATCHER_PLACEHOLDER = Symbol('watcher') as any;

  let cycle = 0;
  let notifyIndex = 0;
  let queuedLength = 0;
  let activeSub: ReactiveNode | undefined;

  const queued: (_Watcher | undefined)[] = [];
  const {link, unlink, propagate, checkDirty, shallowPropagate} = createReactiveSystem({
    update(node: _Computed) {
      return node.update();
    },
    notify(node: _Watcher) {
      queued[queuedLength++] = node;
      node.flags &= ~ReactiveFlags.Watching;
    },
    unwatched(node) {
      let toRemove = node.deps;
      if (toRemove !== undefined) {
        do {
          toRemove = unlink(toRemove, node);
        } while (toRemove !== undefined);
        node.flags |= ReactiveFlags.Dirty;
      }
    },
  });

  function flush(): void {
    try {
      while (notifyIndex < queuedLength) {
        const effect = queued[notifyIndex]!;
        queued[notifyIndex++] = undefined;
        effect.flags |= ReactiveFlags.Watching;
        effect.run();
      }
    } finally {
      while (notifyIndex < queuedLength) {
        const effect = queued[notifyIndex]!;
        queued[notifyIndex++] = undefined;
        effect.flags |= ReactiveFlags.Watching | ReactiveFlags.Recursed;
      }
      notifyIndex = 0;
      queuedLength = 0;
    }
  }

  class _State<T = any> implements ReactiveNode, State<T> {
    subs: Link | undefined = undefined;
    subsTail: Link | undefined = undefined;
    flags: ReactiveFlags = ReactiveFlags.None;
    watchCount = 0;
    previousValue: T;

    #brand() {}
    static {
      isState = ((s) => typeof s === 'object' && #brand in s) as typeof isState;
    }

    constructor(
      private value: T,
      private options?: Options<T>,
    ) {
      this.previousValue = value;
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
      if (!isState(this)) {
        throw new TypeError('Wrong receiver type for Signal.State.prototype.get');
      }
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot read from state inside watcher');
      }
      if (activeSub !== undefined) {
        const lastLink = this.subsTail;
        link(this, activeSub, cycle);
        const newLink = this.subsTail!;
        if (newLink !== lastLink) {
          const newSub = newLink.sub;
          if (isComputed(newSub) && (newSub as _Computed).watchCount) {
            this.onWatched();
          }
        }
      }
      return this.value;
    }

    set(value: T): void {
      if (!isState(this)) {
        throw new TypeError('Wrong receiver type for Signal.State.prototype.set');
      }
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot write to state inside watcher');
      }
      if (!this.equals(this.value, value)) {
        this.value = value;
        const subs = this.subs;
        if (subs !== undefined) {
          propagate(subs);
          shallowPropagate(subs);
          flush();
        }
      }
    }
  }

  export interface State<T> {
    get(): T;
    set(value: T): void;
  }

  export const State: {
    new <T>(value: T, options?: Options<T>): State<T>;
  } = _State;

  class _Computed<T = any> implements ReactiveNode, Computed<T> {
    subs: Link | undefined = undefined;
    subsTail: Link | undefined = undefined;
    deps: Link | undefined = undefined;
    depsTail: Link | undefined = undefined;
    flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty;
    isError = true;
    watchCount = 0;
    value: T | undefined = undefined;

    #brand() {}
    static {
      isComputed = ((c: any) => typeof c === 'object' && #brand in c) as typeof isComputed;
    }

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
          const dep = link.dep as _AnySignal;
          dep.onWatched();
        }
      }
    }

    onUnwatched() {
      if (--this.watchCount === 0) {
        this.options?.[subtle.unwatched]?.call(this);
        for (let link = this.deps; link !== undefined; link = link.nextDep) {
          const dep = link.dep as _AnySignal;
          dep.onUnwatched();
        }
      }
    }

    get() {
      if (!isComputed(this)) {
        throw new TypeError('Wrong receiver type for Signal.Computed.prototype.get');
      }
      if (activeSub === WATCHER_PLACEHOLDER) {
        throw new Error('Cannot read from computed inside watcher');
      }
      let flags = this.flags;
      if (flags & ReactiveFlags.RecursedCheck) {
        throw new Error('Cycles detected');
      }
      if (
        flags & ReactiveFlags.Dirty ||
        (flags & ReactiveFlags.Pending && checkDirty(this.deps!, this))
      ) {
        if (this.update()) {
          const subs = this.subs;
          if (subs !== undefined) {
            shallowPropagate(subs);
          }
        }
      } else if (flags & ReactiveFlags.Pending) {
        this.flags = flags & ~ReactiveFlags.Pending;
      }
      if (activeSub !== undefined) {
        const lastLink = this.subsTail;
        link(this, activeSub, cycle);
        const newLink = this.subsTail!;
        if (newLink !== lastLink) {
          const newSub = newLink.sub;
          if (isComputed(newSub) && (newSub as _Computed).watchCount) {
            this.onWatched();
          }
        }
      }
      if (this.isError) {
        throw this.value;
      }
      return this.value!;
    }

    update(): boolean {
      const prevSub = activeSub;
      activeSub = this;
      ++cycle;
      this.depsTail = undefined;
      this.flags = 5 as ReactiveFlags.Mutable | ReactiveFlags.RecursedCheck;
      const oldValue = this.value;
      try {
        const newValue = this.getter();
        if (this.isError || !this.equals(oldValue!, newValue)) {
          this.isError = false;
          this.value = newValue;
          return true;
        }
        return false;
      } catch (err) {
        if (!this.isError || !this.equals(oldValue!, err as any)) {
          this.isError = true;
          this.value = err as any;
          return true;
        }
        return false;
      } finally {
        const watched = !!this.watchCount;
        let toRemove = this.depsTail !== undefined ? (this.depsTail as Link).nextDep : this.deps;
        while (toRemove !== undefined) {
          if (watched) {
            const dep = toRemove.dep as _AnySignal;
            dep.onUnwatched();
          }
          toRemove = unlink(toRemove, this);
        }
        activeSub = prevSub;
        this.flags &= ~(4 satisfies ReactiveFlags.RecursedCheck);
      }
    }
  }

  export interface Computed<T> {
    get(): T;
  }

  export const Computed: {
    new <T>(getter: () => T, options?: Options<T>): Computed<T>;
  } = _Computed;

  class _Watcher implements ReactiveNode, subtle.Watcher {
    deps: Link | undefined = undefined;
    depsTail: Link | undefined = undefined;
    flags = ReactiveFlags.Watching;
    watchList = new Map<_AnySignal, Link>();

    #brand() {}
    static {
      isWatcher = (w: any): w is _Watcher => #brand in w;
    }

    constructor(private fn: () => void) {}

    run() {
      const prevSub = activeSub;
      activeSub = WATCHER_PLACEHOLDER;
      this.flags &= ~(ReactiveFlags.Dirty | ReactiveFlags.Pending);
      try {
        this.fn();
      } finally {
        activeSub = prevSub;
      }
    }

    #assertSignals(signals: _AnySignal[]): void {
      for (const signal of signals) {
        if (!isComputed(signal) && !isState(signal)) {
          throw new TypeError('Called watch/unwatch without a Computed or State argument');
        }
      }
    }

    watch(...signals: _AnySignal[]): void {
      if (!isWatcher(this)) {
        throw new TypeError('Called watch without Watcher receiver');
      }
      this.#assertSignals(signals);

      for (const signal of signals) {
        if (this.watchList.has(signal)) {
          continue;
        }
        signal.onWatched();
        link(signal, this, 0);
        this.watchList.set(signal, this.depsTail!);
      }
    }

    unwatch(...signals: _AnySignal[]): void {
      if (!isWatcher(this)) {
        throw new TypeError('Called unwatch without Watcher receiver');
      }
      this.#assertSignals(signals);

      for (const signal of signals) {
        const link = this.watchList.get(signal);
        if (link === undefined) {
          continue;
        }
        signal.onUnwatched();
        unlink(link, this);
        this.watchList.delete(signal);
      }
    }

    getPending(): _AnySignal[] {
      if (!isWatcher(this)) {
        throw new TypeError('Called getPending without Watcher receiver');
      }
      const arr: _AnySignal[] = [];
      for (let link = this.deps; link !== undefined; link = link.nextDep) {
        const source = link.dep;
        if (source.flags & (ReactiveFlags.Dirty | ReactiveFlags.Pending) && isComputed(source)) {
          arr.push(link.dep as _AnySignal);
        }
      }
      return arr;
    }
  }

  type _AnySignal<T = any> = _State<T> | _Computed<T>;
  type _AnySink = _Computed<any> | _Watcher;

  type AnySignal<T = any> = State<T> | Computed<T>;
  type AnySink = Computed<any> | subtle.Watcher;

  export namespace subtle {
    export function untrack<T>(fn: () => T) {
      const prevSub = activeSub;
      activeSub = undefined;
      try {
        return fn();
      } finally {
        activeSub = prevSub;
      }
    }

    export interface Watcher {
      watch(...signals: AnySignal[]): void;
      unwatch(...signals: AnySignal[]): void;
      getPending(): AnySignal<any>[];
    }

    export const Watcher: {
      new (fn: () => void): Watcher;
    } = _Watcher;

    export function hasSinks(signal: AnySignal) {
      if (!isComputed(signal) && !isState(signal)) {
        throw new TypeError('Called hasSinks without a Signal argument');
      }
      return (signal as _AnySignal).watchCount > 0;
    }

    export function hasSources(signal: AnySink) {
      if (!isComputed(signal) && !isWatcher(signal)) {
        throw new TypeError('Called hasSources without a Computed or Watcher argument');
      }
      return (signal as _AnySink).depsTail !== undefined;
    }

    export function introspectSinks(signal: AnySignal): AnySink[] {
      if (!isComputed(signal) && !isState(signal)) {
        throw new TypeError('Called introspectSinks without a Signal argument');
      }
      const arr: _AnySink[] = [];
      for (let link = (signal as _AnySignal).subs; link !== undefined; link = link.nextSub) {
        arr.push(link.sub as _AnySink);
      }
      return arr;
    }

    export function introspectSources(sink: AnySink): AnySignal[] {
      if (!isComputed(sink) && !isWatcher(sink)) {
        throw new TypeError('Called introspectSources without a Computed or Watcher argument');
      }
      const arr: _AnySignal[] = [];
      for (let link = (sink as _AnySink).deps; link !== undefined; link = link.nextDep) {
        arr.push(link.dep as _AnySignal);
      }
      return arr;
    }

    export function currentComputed(): Computed<any> | undefined {
      if (isComputed(activeSub)) {
        return activeSub;
      }
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
