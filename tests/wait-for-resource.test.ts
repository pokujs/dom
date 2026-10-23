import { strict as nodeAssert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { assert, describe, it } from 'poku';
import { createWaitFor } from '../src/testing-core.ts';
import { setupHappyDomEnvironment } from '../src/dom-env.ts';

process.exitCode ??= 0;

await setupHappyDomEnvironment({
  packageTag: '@pokujs/dom',
  runtimeOptions: {
    domUrl: 'http://localhost/',
    metricsEnabled: false,
    minMetricMs: 0,
    metricBatchSize: 5,
    metricFlushMs: 10,
  },
});

await describe('waitFor pre-existing async resources', async () => {
  await it('binds timer-backed listeners to their polling attempt', async () => {
    const emitter = new EventEmitter();
    const timer = setInterval(() => emitter.emit('tick', 42), 1);
    let attempts = 0;
    const previous = process.exitCode;
    try {
      const result = await createWaitFor()(
        ({ bind }) => {
          attempts++;
          return new Promise<number>((resolve, reject) => {
            emitter.once(
              'tick',
              bind(function (this: EventEmitter, value: number) {
                nodeAssert.strictEqual(this, emitter);
                try {
                  assert.strictEqual(attempts >= 2, true);
                  resolve(value);
                } catch (error) {
                  reject(error);
                }
              })
            );
          });
        },
        { interval: 1, timeout: 500 }
      );
      nodeAssert.strictEqual(result, 42);
      nodeAssert.ok(attempts >= 2);
      nodeAssert.strictEqual(process.exitCode, previous);
    } finally {
      clearInterval(timer);
    }
  });
});
