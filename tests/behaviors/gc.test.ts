import { describe, expect, it } from 'vitest';
import { Signal } from '../../src/alien.js';

describe('GC', () => {
    it('clears subscription after computed is unref and GC is invoked', async () => {
        const s1 = new Signal.State(10);
        let c1: Signal.Computed | undefined = new Signal.Computed(() => s1.get());
        const c1Ref = new WeakRef(c1);
        c1.get();
        c1 = undefined;

        await gc();
        expect(c1Ref.deref()).toBe(undefined);
    });
});

function gc() {
    return new Promise<void>((resolve) => {
        setImmediate(() => {
            globalThis.gc!();
            resolve();
        });
    })
}
