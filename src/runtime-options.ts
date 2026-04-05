import type {
  RuntimeOptionArgPrefixes,
  RuntimeOptions,
} from './types.ts';

const DEFAULT_DOM_URL = 'http://localhost:3000/';
const DEFAULT_METRIC_BATCH_SIZE = 50;
const DEFAULT_METRIC_FLUSH_MS = 50;

const toNumber = (value: string | undefined) => {
  if (!value) return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const findValueByPrefix = (argv: string[], prefix: string) => {
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
};

const parseNonNegativeNumber = (value: string | undefined, fallback: number) => {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
};

export const createRuntimeOptionArgPrefixes = (
  base: string
): RuntimeOptionArgPrefixes => ({
  metrics: `--${base}-metrics=`,
  minMetricMs: `--${base}-min-metric-ms=`,
  domUrl: `--${base}-dom-url=`,
  metricBatchSize: `--${base}-metric-batch-size=`,
  metricFlushMs: `--${base}-metric-flush-ms=`,
});

export const parseRuntimeOptions = (
  prefixes: RuntimeOptionArgPrefixes,
  argv: string[] = process.argv
): RuntimeOptions => {
  const metricsEnabled =
    findValueByPrefix(argv, prefixes.metrics) === '1' ||
    findValueByPrefix(argv, prefixes.metrics) === 'true';

  const domUrl =
    findValueByPrefix(argv, prefixes.domUrl)?.trim() || DEFAULT_DOM_URL;

  const minMetricMs = parseNonNegativeNumber(
    findValueByPrefix(argv, prefixes.minMetricMs),
    0
  );

  const metricBatchSize = parsePositiveInteger(
    findValueByPrefix(argv, prefixes.metricBatchSize),
    DEFAULT_METRIC_BATCH_SIZE
  );

  const metricFlushMs = parsePositiveInteger(
    findValueByPrefix(argv, prefixes.metricFlushMs),
    DEFAULT_METRIC_FLUSH_MS
  );

  return {
    domUrl,
    metricsEnabled,
    minMetricMs,
    metricBatchSize,
    metricFlushMs,
  };
};
