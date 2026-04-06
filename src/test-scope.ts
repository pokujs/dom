import { AsyncLocalStorage } from 'node:async_hooks';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

type MaybePromise = void | Promise<void>;

/**
 * Branded symbol so different plugins' slot keys can never collide and the
 * TypeScript type for `getOrCreateSlot<T>` flows through correctly.
 */
export type SlotKey<T> = symbol & { readonly __slotType: T };

/** Observer fired synchronously whenever `slot.notify(next)` is called. */
export type Observer<T> = (next: T, prev: T) => void;

/** The live state container for one piece of plugin state within a test scope. */
export type Slot<T> = {
  /** Current value — mutate collections in-place or call notify() to replace. */
  readonly value: T;
  /**
   * Register a cleanup callback that runs during `_drain()` after the test
   * body settles, regardless of success or throw. Callbacks are idempotent:
   * adding the same function reference twice is a no-op.
   */
  onDispose(fn: () => MaybePromise): void;
  /**
   * Replace the slot value and synchronously fire all registered observers
   * for this slot key.
   */
  notify(next: T): void;
};

/** Full scope object — created lazily on first plugin access within a test. */
export type TestScope = {
  getOrCreateSlot<T>(key: SlotKey<T>, init: () => T): Slot<T>;
  getSlot<T>(key: SlotKey<T>): Slot<T> | undefined;
  addObserver<T>(key: SlotKey<T>, fn: Observer<T>): void;
  addCleanup(fn: () => MaybePromise): void;
  /** Called by the itBase wrapper after the test body and each.after settle. */
  _drain(): Promise<void>;
};

/**
 * Thin sentinel stored in ALS.  The `scope` property is `undefined` until
 * a plugin first calls `getOrCreateScope()` — that way tests with no DOM
 * plugin incur only one object allocation for the holder itself.
 */
export type LazyHolder = { scope: TestScope | undefined };

class SlotImpl<T> implements Slot<T> {
  #value: T;
  readonly #disposeFns: Set<() => MaybePromise> = new Set();
  readonly #observers: Set<Observer<T>>;

  constructor(init: T, observers: Set<Observer<T>>) {
    this.#value = init;
    this.#observers = observers;
  }

  get value(): T {
    return this.#value;
  }

  onDispose(fn: () => MaybePromise): void {
    this.#disposeFns.add(fn);
  }

  notify(next: T): void {
    const prev = this.#value;
    this.#value = next;
    for (const obs of this.#observers) obs(next, prev);
  }

  async runDispose(): Promise<void> {
    const fns = [...this.#disposeFns].reverse();
    this.#disposeFns.clear();

    const errors: unknown[] = [];
    for (const fn of fns) {
      try {
        const r = fn();
        if (r instanceof Promise) await r;
      } catch (err) {
        errors.push(err);
      }
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Cleanup errors');
  }
}

class TestScopeImpl implements TestScope {
  #slots: Map<symbol, SlotImpl<unknown>> | undefined;
  #observers: Map<symbol, Set<Observer<unknown>>> | undefined;
  #globalCleanups: Array<() => MaybePromise> | undefined;

  getOrCreateSlot<T>(key: SlotKey<T>, init: () => T): Slot<T> {
    if (!this.#slots) this.#slots = new Map();
    let slot = this.#slots.get(key) as SlotImpl<T> | undefined;

    if (!slot) {
      const obs = this.#getObservers<T>(key);
      slot = new SlotImpl<T>(init(), obs as Set<Observer<T>>);
      this.#slots.set(key, slot as SlotImpl<unknown>);
    }

    return slot;
  }

  getSlot<T>(key: SlotKey<T>): Slot<T> | undefined {
    return this.#slots?.get(key) as SlotImpl<T> | undefined;
  }

  addObserver<T>(key: SlotKey<T>, fn: Observer<T>): void {
    const obs = this.#getObservers<T>(key);
    obs.add(fn);
  }

  addCleanup(fn: () => MaybePromise): void {
    if (!this.#globalCleanups) this.#globalCleanups = [];
    this.#globalCleanups.push(fn);
  }

  async _drain(): Promise<void> {
    const errors: unknown[] = [];

    if (this.#slots) {
      const slots = [...this.#slots.values()].reverse();
      for (const slot of slots) {
        try {
          await slot.runDispose();
        } catch (err) {
          errors.push(err);
        }
      }
    }

    if (this.#globalCleanups) {
      const fns = [...this.#globalCleanups].reverse();
      this.#globalCleanups = undefined;
      for (const fn of fns) {
        try {
          const r = fn();
          if (r instanceof Promise) await r;
        } catch (err) {
          errors.push(err);
        }
      }
    }

    this.#slots = undefined;
    this.#observers = undefined;

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Scope drain errors');
  }

  #getObservers<T>(key: SlotKey<T>): Set<Observer<T>> {
    if (!this.#observers) this.#observers = new Map();
    let obs = this.#observers.get(key) as Set<Observer<T>> | undefined;
    if (!obs) {
      obs = new Set();
      this.#observers.set(key, obs as Set<Observer<unknown>>);
    }
    return obs;
  }
}

export const als = new AsyncLocalStorage<LazyHolder>();

/** Create the sentinel object stored in ALS for one test invocation. */
export const createLazyHolder = (): LazyHolder => ({ scope: undefined });

/**
 * Wrap `fn` in an ALS context and drain the scope after `fn` settles.
 * This is the entire poku-side integration: one call per `itBase` invocation.
 */
export const runScoped = async (
  holder: LazyHolder,
  fn: () => Promise<unknown> | unknown
): Promise<void> => {
  await als.run(holder, async () => {
    const r = fn();
    if (r instanceof Promise) await r;
  });

  if (holder.scope) await holder.scope._drain();
};

/**
 * Get the current test scope, creating it inside the holder if this is the
 * first plugin call within the test.  Returns `undefined` when called outside
 * an `als.run()` context (e.g. top-level module code, beforeAll equivalents).
 */
export const getOrCreateScope = (): TestScope | undefined => {
  const holder = als.getStore();
  if (!holder) return undefined;
  if (!holder.scope) holder.scope = new TestScopeImpl();
  return holder.scope;
};

/**
 * Get the current scope without creating it. `undefined` when there is no
 * active scope or it has not been materialised yet.
 */
export const getCurrentScope = (): TestScope | undefined =>
  als.getStore()?.scope;

/**
 * Create a typed, globally-unique slot key.
 * Uses `Symbol.for(name)` so the same key resolves across module re-imports
 * and serialisation boundaries.
 *
 * @example
 * ```ts
 * const MOUNTED_KEY = defineSlotKey<Set<InternalMounted>>('@pokujs/react.mounted');
 * ```
 */
export const defineSlotKey = <T>(name: string): SlotKey<T> =>
  Symbol.for(name) as SlotKey<T>;

const SCOPE_HOOKS_KEY = Symbol.for('@pokujs/poku.test-scope-hooks');

export type ScopeHooks = {
  createHolder: typeof createLazyHolder;
  runScoped: typeof runScoped;
};

type GlobalWithScopeHooks = typeof globalThis & {
  [SCOPE_HOOKS_KEY]?: ScopeHooks;
};

/**
 * Register this scope provider in `globalThis` so poku's `itBase` can pick
 * it up through the generic hook contract.
 *
 * Call this once from the DOM environment setup module (dom-setup-happy.ts /
 * dom-setup-jsdom.ts).  It is idempotent.
 */
export const registerScopeHooks = (): void => {
  const g = globalThis as GlobalWithScopeHooks;
  if (!g[SCOPE_HOOKS_KEY]) {
    g[SCOPE_HOOKS_KEY] = { createHolder: createLazyHolder, runScoped };
  }
};

/** Retrieve the registered scope hooks, or `undefined` if not yet registered. */
export const getScopeHooks = (): ScopeHooks | undefined =>
  (globalThis as GlobalWithScopeHooks)[SCOPE_HOOKS_KEY];
