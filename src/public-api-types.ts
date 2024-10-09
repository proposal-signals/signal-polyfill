/**
 * The purpose of these tests is to make sure the types are exposed how we expect,
 * and that we double-check what we're exposing as public API
 */
import {expectTypeOf} from 'expect-type';
import {Signal} from './wrapper.ts';

/**
 * Top-Level
 */
expectTypeOf<keyof typeof Signal>().toMatchTypeOf<
  'State' | 'Computed' | 'subtle' | 'isState' | 'isComputed' | 'isWatcher'
>();

let num = new Signal.State(0);
expectTypeOf(num).toMatchTypeOf<Signal.State<number>>();
expectTypeOf(num.get()).toMatchTypeOf<number>();
expectTypeOf(num.set(1)).toMatchTypeOf<void>();

expectTypeOf<keyof Signal.State<unknown> & string>().toEqualTypeOf<'get' | 'set'>();
expectTypeOf<keyof Signal.Computed<unknown> & string>().toEqualTypeOf<'get'>();
expectTypeOf<keyof typeof Signal.subtle>().toEqualTypeOf<
  | 'untrack'
  | 'currentComputed'
  | 'introspectSources'
  | 'introspectSinks'
  | 'hasSinks'
  | 'hasSources'
  | 'Watcher'
  | 'watched'
  | 'unwatched'
>();
