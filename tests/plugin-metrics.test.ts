import { assert, test } from 'poku';
import {
  buildRuntimeOptionArgs,
  createMetricsSummary,
  normalizeMetricsOptions,
  selectTopSlowestMetrics,
} from '../src/plugin-metrics.ts';
import { createRuntimeOptionArgPrefixes } from '../src/runtime-options.ts';

test('normalizeMetricsOptions keeps defaults when disabled', async () => {
  const metrics = normalizeMetricsOptions(undefined);

  assert.strictEqual(metrics.enabled, false);
  assert.strictEqual(metrics.topN, 5);
  assert.strictEqual(metrics.minDurationMs, 0);
});

test('buildRuntimeOptionArgs emits prefixed metrics args', async () => {
  const prefixes = createRuntimeOptionArgPrefixes('poku-dom');
  const options = buildRuntimeOptionArgs(
    { domUrl: 'http://example.local/', metrics: true },
    normalizeMetricsOptions({ enabled: true, minDurationMs: 1.5 }),
    prefixes
  );

  assert.deepStrictEqual(options, [
    '--poku-dom-dom-url=http://example.local/',
    '--poku-dom-metrics=1',
    '--poku-dom-min-metric-ms=1.5',
  ]);
});

test('metrics summary returns sorted top entries', async () => {
  const summary = createMetricsSummary(
    [
      { file: 'a', componentName: 'A', durationMs: 0.4 },
      { file: 'b', componentName: 'B', durationMs: 4.2 },
      { file: 'c', componentName: 'C', durationMs: 3.3 },
    ],
    normalizeMetricsOptions({ enabled: true, topN: 2, minDurationMs: 1 })
  );

  assert.ok(summary);
  assert.strictEqual(summary?.totalCaptured, 3);
  assert.deepStrictEqual(
    summary?.topSlowest.map((entry) => entry.componentName),
    ['B', 'C']
  );
});

test('selectTopSlowestMetrics truncates and orders values', async () => {
  const top = selectTopSlowestMetrics(
    [
      { file: 'a', componentName: 'A', durationMs: 1 },
      { file: 'b', componentName: 'B', durationMs: 3 },
      { file: 'c', componentName: 'C', durationMs: 2 },
    ],
    normalizeMetricsOptions({ enabled: true, topN: 2 })
  );

  assert.deepStrictEqual(top.map((entry) => entry.componentName), ['B', 'C']);
});
