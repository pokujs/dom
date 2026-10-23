import { strict as nodeAssert, AssertionError } from 'node:assert';
import { describe, it, assert } from 'poku';
import { captureAssertions } from 'poku/plugins';
import { createWaitFor } from '../src/testing-core.ts';
import {
  setupHappyDomEnvironment,
  setupJsdomEnvironment,
} from '../src/dom-env.ts';

process.exitCode ??= 0;

const runtimeOptions = {
  domUrl: 'http://localhost/',
  metricsEnabled: false,
  minMetricMs: 0,
  metricBatchSize: 5,
  metricFlushMs: 10,
};
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

await describe('waitFor public assertion capture integration', async () => {
  for (const setup of [setupHappyDomEnvironment, setupJsdomEnvironment]) {
    await setup({ runtimeOptions, packageTag: '@pokujs/dom' });
    await it(`${setup.name} discards failed polls and returns the winning value`, async () => {
      const waitFor = createWaitFor();
      let attempts = 0;
      const exitCode = process.exitCode;
      const result = await waitFor(
        async () => {
          attempts++;
          await Promise.resolve();
          assert.strictEqual(attempts >= 3, true, 'ready after polling');
          return 42;
        },
        { interval: 1, timeout: 500 }
      );
      nodeAssert.strictEqual(result, 42);
      nodeAssert.ok(attempts >= 3);
      nodeAssert.strictEqual(process.exitCode, exitCode);
    });

    await it(`${setup.name} commits the last assertion failure while preserving the timeout error`, async () => {
      const waitFor = createWaitFor();
      const previous = process.exitCode;
      let thrown: unknown;
      const result = await captureAssertions(async () => {
        try {
          await waitFor(
            () => assert.strictEqual(1, 2, 'final polling failure'),
            { interval: 1, timeout: 15 }
          );
        } catch (error) {
          thrown = error;
        }
      });
      nodeAssert.strictEqual(result.status, 'failed');
      nodeAssert.ok(thrown instanceof AssertionError);
      nodeAssert.match(thrown.message, /strictly equal/);
      nodeAssert.match(thrown.message, /Ignored nodes/);
      nodeAssert.strictEqual(process.exitCode, previous);
    });
  }

  await it('leaves ordinary query errors catchable without changing process status', async () => {
    const previous = process.exitCode;
    await nodeAssert.rejects(
      createWaitFor()(
        () => {
          throw new Error('query missing');
        },
        { interval: 1, timeout: 10 }
      ),
      /query missing/
    );
    nodeAssert.strictEqual(process.exitCode, previous);
  });

  await it('keeps successful and exhausted concurrent polling independent', async () => {
    const waitFor = createWaitFor();
    const results = await Promise.all([
      captureAssertions(() =>
        waitFor(() => assert.strictEqual(1, 2, 'exhausted'), {
          interval: 1,
          timeout: 15,
        })
      ),
      captureAssertions(() =>
        waitFor(
          () => {
            assert.strictEqual(2, 2);
            return 'ready';
          },
          { interval: 1, timeout: 50 }
        )
      ),
    ]);
    nodeAssert.strictEqual(results[0]?.status, 'failed');
    nodeAssert.strictEqual(results[1]?.status, 'passed');
    nodeAssert.strictEqual(process.exitCode, 0);
  });

  await it('does not capture assertions from sibling work while a poll is waiting', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const result = await captureAssertions(async () => {
      const pending = createWaitFor()(
        async () => {
          await gate;
          return 42;
        },
        { timeout: 100 }
      );
      try {
        assert.strictEqual(1, 2, 'sibling failure');
      } catch {}
      release();
      nodeAssert.strictEqual(await pending, 42);
    });
    nodeAssert.strictEqual(result.status, 'failed');
  });

  await it('replays only the successful poll assertion labels', async () => {
    const write = process.stdout.write;
    let output = '';
    process.stdout.write = (chunk: any): boolean => {
      output += String(chunk);
      return true;
    };
    try {
      let attempts = 0;
      await createWaitFor()(
        () => {
          attempts++;
          assert.ok(true, 'intermediate success');
          assert.ok(attempts > 1, 'winning assertion');
        },
        { interval: 1, timeout: 100 }
      );
    } finally {
      process.stdout.write = write;
    }
    nodeAssert.strictEqual(output.match(/intermediate success/g)?.length, 1);
    nodeAssert.strictEqual(output.match(/winning assertion/g)?.length, 1);
  });

  await it('reports a pending assertion when its callback finishes after timeout', async () => {
    const previous = process.exitCode;
    const write = process.stdout.write;
    process.stdout.write = () => true;
    try {
      await nodeAssert.rejects(
        createWaitFor()(
          async () => {
            await sleep(30);
            assert.strictEqual(1, 2, 'late pending failure');
          },
          { timeout: 5 }
        )
      );
      await sleep(50);
      nodeAssert.strictEqual(process.exitCode, 1);
    } finally {
      process.stdout.write = write;
      process.exitCode = previous ?? 0;
    }
  });

  await it('does not read or mutate the private retry registry', async () => {
    const key = Symbol.for('@poku/retryContext');
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    let reads = 0;
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get() {
        reads++;
        throw new Error('private retry state read');
      },
    });
    try {
      nodeAssert.strictEqual(await createWaitFor()(async () => 42), 42);
      nodeAssert.strictEqual(reads, 0);
    } finally {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
});
