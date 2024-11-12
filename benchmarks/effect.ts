import {Signal} from '../src';

const queue: Signal.Computed<any>[] = [];

export const effect = (fn: () => void) => {
  const c = new Signal.Computed(fn);
  const watcher = new Signal.subtle.Watcher(() => {
    if (inBatch === 0) {
      throw new Error('signal changed outside of batch');
    }
    queue.push(c);
    watcher.watch(); // re-enable watcher
  });
  c.get();
  watcher.watch(c);
};

const processQueue = () => {
  while (queue.length) {
    queue.shift()!.get();
  }
};

let inBatch = 0;
export const batch = (fn: () => void) => {
  inBatch++;
  try {
    fn();
  } finally {
    inBatch--;
    if (inBatch === 0) processQueue();
  }
};
