import { strict as nodeAssert } from 'node:assert';
import { createRequire } from 'node:module';
import { describe, it } from 'poku';
import {
  setupHappyDomEnvironment,
  setupJsdomEnvironment,
} from '../src/dom-env.ts';

const require = createRequire(import.meta.url);
const fixturePath = require.resolve('./__fixtures__/dom-globals.cjs');

const runtimeOptions = {
  domUrl: 'http://localhost/',
  metricsEnabled: false,
  minMetricMs: 0,
  metricBatchSize: 5,
  metricFlushMs: 10,
};

await describe('DOM globals in CommonJS consumers', async () => {
  for (const setup of [setupHappyDomEnvironment, setupJsdomEnvironment]) {
    await it(`${setup.name} exposes browser globals to CommonJS modules`, async () => {
      await setup({ runtimeOptions, packageTag: '@pokujs/dom' });
      delete require.cache[fixturePath];
      const browserGlobals = require(fixturePath) as Record<string, unknown>;
      for (const key of ['window', 'document', 'HTMLElement', 'Node']) {
        nodeAssert.strictEqual(
          Object.getOwnPropertyDescriptor(globalThis, key)?.enumerable,
          true
        );
        nodeAssert.strictEqual(
          browserGlobals[key],
          Reflect.get(globalThis, key)
        );
      }
    });
  }
});
