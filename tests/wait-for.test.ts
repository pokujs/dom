import { AsyncLocalStorage } from 'node:async_hooks';
import { strict as nodeAssert } from 'node:assert';
import { describe, it } from 'poku';
import { createWaitFor } from '../src/testing-core.ts';

const retryKey = Symbol.for('@poku/retryContext');
const retryGlobals = globalThis as Record<symbol, unknown>;

await describe('waitFor retry integration', async () => {
  await it('uses the retry provider context without exposing it to sibling work', async () => {
    const original = retryGlobals[retryKey];
    const storage = new AsyncLocalStorage<Array<{ silent: boolean }>>();
    let runs = 0;
    const state = {
      get stack() {
        return storage.getStore() ?? null;
      },
      run<Result>(entry: { silent: boolean }, callback: () => Result) {
        runs++;
        return storage.run([entry], callback);
      },
    };
    retryGlobals[retryKey] = state;
    const waitFor = createWaitFor(async (callback) => callback());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let callbackStack: typeof state.stack;
    let siblingStack: typeof state.stack;
    try {
      const pending = waitFor(async () => {
        callbackStack = state.stack;
        await gate;
        nodeAssert.strictEqual(state.stack?.[0]?.silent, true);
        return 42;
      });
      siblingStack = state.stack;
      release();
      nodeAssert.strictEqual(await pending, 42);
    } finally {
      release();
      retryGlobals[retryKey] = original;
    }
    nodeAssert.strictEqual(runs, 1);
    nodeAssert.strictEqual(callbackStack![0]?.silent, true);
    nodeAssert.strictEqual(siblingStack, null);
  });

  await it('leaves legacy retry state untouched when no context provider exists', async () => {
    const original = retryGlobals[retryKey];
    const state = { stack: null };
    retryGlobals[retryKey] = state;
    const waitFor = createWaitFor(async (callback) => callback());
    try {
      await waitFor(async () => {
        await Promise.resolve();
        nodeAssert.strictEqual(state.stack, null);
      });
    } finally {
      retryGlobals[retryKey] = original;
    }
  });
});
