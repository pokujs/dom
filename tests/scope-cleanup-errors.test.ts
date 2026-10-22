import { strict as nodeAssert } from 'node:assert';
import { describe, it } from 'poku';
import {
  als,
  createLazyHolder,
  createScopedRegistry,
  getOrCreateScope,
  runScoped,
} from '../src/test-scope.ts';

const scopeHooksKey = Symbol.for('@pokujs/poku.test-scope-hooks');
const scopeGlobals = globalThis as Record<symbol, unknown>;
const originalHooks = scopeGlobals[scopeHooksKey];
delete scopeGlobals[scopeHooksKey];

try {
  await describe('Scope cleanup errors', async () => {
    await it('drains fallback resources after a scoped cleanup fails', async () => {
      const cleanupError = new Error('scoped cleanup failed');
      let cleaned = 0;
      const registry = createScopedRegistry<string>({
        name: '@test/fallback-after-scope-error',
        onCleanup(items) {
          cleaned += items.size;
          items.clear();
        },
      });
      als.exit(() => registry.getItems().add('resource'));
      await nodeAssert.rejects(
        runScoped(createLazyHolder(), () => {
          getOrCreateScope()!.addCleanup(() => {
            throw cleanupError;
          });
        }),
        cleanupError
      );
      nodeAssert.strictEqual(cleaned, 1);
      nodeAssert.strictEqual(registry.fallbackItems.size, 0);
    });

    await it('drains every fallback registry and preserves all cleanup failures', async () => {
      const scopedError = new Error('scope failed');
      const fallbackError = new Error('fallback failed');
      const calls: string[] = [];
      const first = createScopedRegistry<string>({
        name: '@test/first-fallback-error',
        onCleanup(items) {
          items.clear();
          calls.push('first');
          throw fallbackError;
        },
      });
      const second = createScopedRegistry<string>({
        name: '@test/second-fallback-error',
        onCleanup(items) {
          items.clear();
          calls.push('second');
        },
      });
      als.exit(() => {
        first.getItems().add('first');
        second.getItems().add('second');
      });
      await nodeAssert.rejects(
        runScoped(createLazyHolder(), () => {
          getOrCreateScope()!.addCleanup(() => {
            throw scopedError;
          });
        }),
        (error: unknown) => {
          nodeAssert.ok(error instanceof AggregateError);
          nodeAssert.deepStrictEqual(error.errors, [
            scopedError,
            fallbackError,
          ]);
          return true;
        }
      );
      nodeAssert.deepStrictEqual(calls, ['first', 'second']);
    });

    await it('waits for overlapping scope cleanups before draining fallback resources', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const registry = createScopedRegistry<string>({
        name: '@test/fallback-after-overlapping-cleanups',
        onCleanup(items) {
          items.clear();
        },
      });
      als.exit(() => registry.getItems().add('resource'));
      const pending = runScoped(createLazyHolder(), () => {
        getOrCreateScope()!.addCleanup(async () => {
          await gate;
        });
      });
      try {
        await Promise.resolve();
        await runScoped(createLazyHolder(), () => {});
        nodeAssert.strictEqual(registry.fallbackItems.size, 1);
      } finally {
        release();
        await pending;
      }
      nodeAssert.strictEqual(registry.fallbackItems.size, 0);
    });

    await it('preserves body and cleanup errors while draining resources', async () => {
      const bodyError = new Error('body failed');
      const cleanupError = new Error('cleanup failed');
      await nodeAssert.rejects(
        runScoped(createLazyHolder(), () => {
          getOrCreateScope()!.addCleanup(() => {
            throw cleanupError;
          });
          throw bodyError;
        }),
        (error: unknown) => {
          nodeAssert.ok(error instanceof AggregateError);
          nodeAssert.deepStrictEqual(error.errors, [bodyError, cleanupError]);
          return true;
        }
      );
    });
  });
} finally {
  scopeGlobals[scopeHooksKey] = originalHooks;
}
