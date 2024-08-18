import {describe, expect, it} from 'vitest';
import {Signal} from '../../src/wrapper.js';

describe('Signal.Volatile', () => {
  it('reads the value using the given function', () => {
    const volatile = new Signal.Volatile(() => 'value');

    expect(volatile.get()).toBe('value');
  });
});
