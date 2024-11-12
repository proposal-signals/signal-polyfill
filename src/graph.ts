import {defaultEquals, ValueEqualityFn} from './equality';

export interface ReactiveNode {
  wrapper?: any;
}

export interface ConsumerNode extends ReactiveNode {
  markDirty?: () => void;
  producers?: Map<SignalNode<any>, ConsumerProducerLink<any>>;
}

export interface ConsumerProducerLink<T> {
  used?: boolean;
  version: number;
  value: T;
}

let inNotificationPhase = false;
export const isInNotificationPhase = () => inNotificationPhase;

let activeConsumer: ConsumerNode | null = null;

function setActiveConsumer(consumer: ConsumerNode | null): ConsumerNode | null {
  const prevConsumer = activeConsumer;
  activeConsumer = consumer;
  return prevConsumer;
}

export function getActiveConsumer(): ConsumerNode | null {
  return activeConsumer;
}

export function untrack<T>(cb: () => T): T {
  let output: T;
  let prevActiveConsumer = null;
  try {
    prevActiveConsumer = setActiveConsumer(null);
    output = cb();
  } finally {
    setActiveConsumer(prevActiveConsumer);
  }
  return output;
}

export class SignalNode<T> implements ReactiveNode {
  value: T;
  version = 0;
  equalCache?: Record<number, boolean>;
  consumers = new Map<ConsumerNode, ConsumerProducerLink<T>>();

  wrapper?: any;
  equalFn: ValueEqualityFn<T> = defaultEquals;
  watchedFn?: () => void;
  unwatchedFn?: () => void;

  constructor(value: T) {
    this.value = value;
  }

  set(newValue: T, markDirty = true): void {
    const same = this.equal(this.value, newValue);
    if (!same) {
      this.value = newValue;
      this.version++;
      this.equalCache = undefined;
      if (markDirty) {
        this.markConsumersDirty();
      }
    }
  }

  equal(a: T, b: T): boolean {
    return this.equalFn.call(this.wrapper, a, b);
  }

  markConsumersDirty() {
    const prevNotificationPhase = inNotificationPhase;
    inNotificationPhase = true;
    try {
      for (const consumer of this.consumers.keys()) {
        consumer.markDirty?.();
      }
    } finally {
      inNotificationPhase = prevNotificationPhase;
    }
  }

  get(): T {
    if (isInNotificationPhase()) {
      throw new Error('Reading signals not permitted during Watcher callback');
    }
    const currentConsumer = getActiveConsumer();
    const alwaysDefinedConsumer = currentConsumer ?? {};
    const link = this.registerConsumer(alwaysDefinedConsumer);
    try {
      this.update();
      const value = this.value;
      link.used = true;
      link.value = value;
      link.version = this.version;
      return value;
    } finally {
      if (!currentConsumer) {
        this.unregisterConsumer(alwaysDefinedConsumer);
      }
    }
  }

  registerConsumer(consumer: ConsumerNode): ConsumerProducerLink<T> {
    let link = this.consumers.get(consumer);
    if (!link) {
      link = consumer.producers?.get(this);
      if (!link) {
        link = {version: -1, value: undefined as any};
        consumer.producers?.set(this, link);
      }
      this.consumers.set(consumer, link);
      if (this.consumers.size === 1) {
        untrack(() => this.startUsed());
      }
    }
    return link;
  }

  unregisterConsumer(consumer: ConsumerNode, bidirectional = true) {
    if (bidirectional) {
      consumer.producers?.delete(this);
    }
    const present = this.consumers.delete(consumer);
    if (present && this.consumers.size === 0) {
      untrack(() => this.endUsed());
    }
  }

  update() {}

  startUsed() {
    this.watchedFn?.call(this.wrapper);
  }

  endUsed() {
    this.unwatchedFn?.call(this.wrapper);
  }

  isUpToDate(consumerLink: ConsumerProducerLink<T>) {
    this.update();
    if (consumerLink.version === this.version) {
      return true;
    }
    if (consumerLink.version === this.version - 1) {
      return false;
    }
    if (!this.equalCache) {
      this.equalCache = {};
    }
    let res = this.equalCache[consumerLink.version];
    if (res === undefined) {
      res = this.equal(consumerLink.value, this.value);
      this.equalCache[consumerLink.version] = res;
    }
    return res;
  }
}

const COMPUTED_UNSET: any = Symbol('UNSET');
const COMPUTED_ERRORED: any = Symbol('ERRORED');
type ComputedSpecialValues = typeof COMPUTED_UNSET | typeof COMPUTED_ERRORED;
const isComputedSpecialValue = (value: any): value is ComputedSpecialValues =>
  value === COMPUTED_UNSET || value === COMPUTED_ERRORED;

export class ComputedNode<T> extends SignalNode<T | ComputedSpecialValues> implements ConsumerNode {
  producers = new Map<SignalNode<any>, ConsumerProducerLink<any>>();
  dirty = true;
  computing = false;
  error: any;

  equal(a: T | ComputedSpecialValues, b: T | ComputedSpecialValues): boolean {
    if (isComputedSpecialValue(a) || isComputedSpecialValue(b)) {
      return false;
    }
    return super.equal(a, b);
  }

  markDirty() {
    if (!this.dirty) {
      this.dirty = true;
      this.markConsumersDirty();
    }
  }

  startUsed(): void {
    for (const producer of this.producers.keys()) {
      producer.registerConsumer(this);
    }
    this.dirty = true;
    super.startUsed();
  }

  endUsed(): void {
    for (const producer of this.producers.keys()) {
      producer.unregisterConsumer(this, false);
    }
    super.endUsed();
  }

  #areProducersUpToDate(): boolean {
    for (const [producer, link] of this.producers) {
      if (!producer.isUpToDate(link)) {
        return false;
      }
    }
    return true;
  }

  #removeUnusedProducers(): void {
    for (const [producer, link] of this.producers) {
      if (!link.used) {
        producer.unregisterConsumer(this);
      } else {
        link.used = false;
      }
    }
  }

  update(): void {
    if (!this.dirty) {
      return;
    }
    if (this.value !== COMPUTED_UNSET && this.#areProducersUpToDate()) {
      this.dirty = false;
      return;
    }
    if (this.computing) {
      throw new Error('Detected cycle in computations.');
    }
    this.computing = true;
    let value: T | ComputedSpecialValues;
    const prevActiveConsumer = setActiveConsumer(this);
    try {
      value = this.computeFn.call(this.wrapper);
    } catch (error) {
      value = COMPUTED_ERRORED;
      this.error = error;
    }
    this.#removeUnusedProducers();
    setActiveConsumer(prevActiveConsumer);
    this.computing = false;
    this.dirty = false;
    this.set(value, false);
  }

  constructor(public computeFn: () => T) {
    super(COMPUTED_UNSET);
  }

  get() {
    const res = super.get();
    if (isComputedSpecialValue(res)) {
      throw this.error;
    }
    return res;
  }
}

export class WatcherNode implements ConsumerNode {
  wrapper?: any;
  producers = new Map<SignalNode<any>, ConsumerProducerLink<any>>();
  dirty = false;

  markDirty() {
    if (!this.dirty) {
      this.dirty = true;
      this.notifyFn?.call(this.wrapper);
    }
  }

  constructor(public notifyFn: () => void) {}
}
