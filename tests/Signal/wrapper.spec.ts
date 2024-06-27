// @ts-nocheck

import { afterEach, describe, expect, it, vi } from 'vitest';
import {Signal} from '../../src/wrapper';

  it('support batch unwatch', async () => {
    let amountOfItems = 3; // it not failing if  = 2
    let selectedRow = new Signal.State(0);
    let rows = new Array(amountOfItems).fill(0).map((_, i) => new Signal.State(i));
    let rowsSelectionState = rows.map(
      (row) => new Signal.Computed(() => selectedRow.get() === row.get()),
    );
    let wRef: Signal.subtle.Watcher;
    let watcherRunCount = 0;
    let validationRunCount = 0;
    let validationScheduled = false;
    let w = new Signal.subtle.Watcher(() => {
      watcherRunCount++;
      if (validationScheduled) return;
      validationScheduled = true;
      Promise.resolve().then(() => {
        // generic framework validation logic, executing changed computed states
        wRef.getPending().forEach((cell) => {
          cell.get();
        });
        wRef.watch();
        validationScheduled = false;
        validationRunCount++;
      });
    });
    wRef = w;

    expect(watcherRunCount).toBe(0);

    // init logic
    rowsSelectionState.forEach((row) => {
      w.watch(row);
      row.get();
    });

    expect(watcherRunCount).toBe(0);
    expect(validationRunCount).toBe(0);

    // select a cell
    selectedRow.set(1);

    expect(watcherRunCount).toBe(1);
    expect(validationRunCount).toBe(0);

    // this case failing
    w.unwatch(...rowsSelectionState);

    /** - this case working
     rowsSelectionState.forEach((row) => {
        w.unwatch(row);
      });
    */

    // waiting for the validation to run
    await Promise.resolve();

    expect(watcherRunCount).toBe(1);
    expect(validationRunCount).toBe(1);

    // one more row unwatch should not cause errors
    w.unwatch(...rowsSelectionState);
    expect(w.getPending().length).toBe(0);
  });

