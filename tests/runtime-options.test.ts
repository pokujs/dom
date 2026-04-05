import { assert, test } from 'poku';
import {
  createRuntimeOptionArgPrefixes,
  parseRuntimeOptions,
} from '../src/runtime-options.ts';

test('parseRuntimeOptions reads prefixed flags', async () => {
  const prefixes = createRuntimeOptionArgPrefixes('poku-dom');
  const options = parseRuntimeOptions(prefixes, [
    'node',
    'tests/example.test.ts',
    '--poku-dom-metrics=1',
    '--poku-dom-min-metric-ms=2.5',
    '--poku-dom-dom-url=http://example.local/',
    '--poku-dom-metric-batch-size=42',
    '--poku-dom-metric-flush-ms=25',
  ]);

  assert.strictEqual(options.metricsEnabled, true);
  assert.strictEqual(options.minMetricMs, 2.5);
  assert.strictEqual(options.domUrl, 'http://example.local/');
  assert.strictEqual(options.metricBatchSize, 42);
  assert.strictEqual(options.metricFlushMs, 25);
});

test('parseRuntimeOptions uses defaults for invalid values', async () => {
  const prefixes = createRuntimeOptionArgPrefixes('poku-dom');
  const options = parseRuntimeOptions(prefixes, [
    'node',
    'tests/example.test.ts',
    '--poku-dom-metrics=nope',
    '--poku-dom-min-metric-ms=-1',
    '--poku-dom-metric-batch-size=0',
    '--poku-dom-metric-flush-ms=nan',
  ]);

  assert.strictEqual(options.metricsEnabled, false);
  assert.strictEqual(options.minMetricMs, 0);
  assert.strictEqual(options.metricBatchSize, 50);
  assert.strictEqual(options.metricFlushMs, 50);
});
