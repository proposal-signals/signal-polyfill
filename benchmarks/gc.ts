const gc = globalThis.gc;
export const setup = gc
  ? () => {
      gc();
    }
  : () => {};
