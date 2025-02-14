import {describe, expect, it} from 'vitest';
import {Signal} from '../../src/wrapper.js';

describe('Signal.State', () => {
  it('should work', () => {
    const stateSignal = new Signal.State(0);
    expect(stateSignal.get()).toEqual(0);

    stateSignal.set(10);

    expect(stateSignal.get()).toEqual(10);
  });

  describe('Comparison semantics', () => {
    it('should cache State by Object.is', () => {
      const state = new Signal.State(NaN);
      let calls = 0;
      const computed = new Signal.Computed(() => {
        calls++;
        return state.get();
      });
      expect(calls).toBe(0);
      expect(computed.get()).toBe(NaN);
      expect(calls).toBe(1);
      state.set(NaN);
      expect(computed.get()).toBe(NaN);
      expect(calls).toBe(1);
    });

    it('applies custom equality in State', () => {
      let ecalls = 0;
      const state = new Signal.State(1, {
        equals() {
          ecalls++;
          return false;
        },
      });
      let calls = 0;
      const computed = new Signal.Computed(() => {
        calls++;
        return state.get();
      });

      expect(calls).toBe(0);
      expect(ecalls).toBe(0);

      expect(computed.get()).toBe(1);
      expect(ecalls).toBe(0);
      expect(calls).toBe(1);

      state.set(1);
      expect(computed.get()).toBe(1);
      expect(ecalls).toBe(1);
      expect(calls).toBe(2);
    });
  });

  describe('Signal.State Initialization', () => {
    it('should initialize with a number', () => {
      const state = new Signal.State(42);
      expect(state.get()).toBe(42);
    });

    it('should initialize with a string', () => {
      const state = new Signal.State('Hello');
      expect(state.get()).toBe('Hello');
    });

    it('should initialize with an object', () => {
      const obj = {key: 'value'};
      const state = new Signal.State(obj);
      expect(state.get()).toEqual(obj);
    });

    it('should initialize with an array', () => {
      const arr = [1, 2, 3];
      const state = new Signal.State(arr);
      expect(state.get()).toEqual(arr);
    });
  });
});
