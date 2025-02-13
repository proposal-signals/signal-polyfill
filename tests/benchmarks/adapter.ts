import {ReactiveFramework} from 'js-reactivity-benchmark';
import {Signal} from '../../src';

export const tc39SignalsProposalStage0: ReactiveFramework = {
  name: 'TC39 Signals Polyfill',
  signal: (initialValue) => {
    const s = new Signal.State(initialValue);
    return {
      write: (v) => s.set(v),
      read: () => s.get(),
    };
  },
  computed: (fn) => {
    const c = new Signal.Computed(fn);
    return {
      read: () => c.get(),
    };
  },
  effect: (fn) => effect(fn),
  withBatch: (fn) => {
    fn();
    processPending();
  },
  withBuild: (fn) => fn(),
};

let needsEnqueue = false;

const w = new Signal.subtle.Watcher(() => {
  if (needsEnqueue) {
    needsEnqueue = false;
    (async () => {
      await Promise.resolve();
      // next micro queue
      processPending();
    })();
  }
});

function processPending() {
  needsEnqueue = true;

  for (const s of w.getPending()) {
    s.get();
  }

  w.watch();
}

export function effect(callback: any) {
  let cleanup: any;

  const computed = new Signal.Computed(() => {
    typeof cleanup === 'function' && cleanup();
    cleanup = callback();
  });

  w.watch(computed);
  computed.get();

  return () => {
    w.unwatch(computed);
    typeof cleanup === 'function' && cleanup();
  };
}
