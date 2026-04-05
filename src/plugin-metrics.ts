import type {
  MetricsOptions,
  MetricsSummary,
  NormalizedMetricsOptions,
  RenderMetric,
  RuntimeOptionArgPrefixes,
  TestingPluginOptions,
} from './types.ts';

const DEFAULT_TOP_N = 5;
const DEFAULT_MIN_DURATION_MS = 0;

export const isRenderMetricMessage = (
  message: unknown,
  metricMessageType: string
): message is { type: string; componentName?: string; durationMs?: number } => {
  if (!message || typeof message !== 'object') return false;
  return (message as Record<string, unknown>).type === metricMessageType;
};

export const isRenderMetricBatchMessage = (
  message: unknown,
  metricBatchMessageType: string
): message is {
  type: string;
  metrics: Array<{ componentName?: string; durationMs?: number }>;
} => {
  if (!message || typeof message !== 'object') return false;

  const record = message as Record<string, unknown>;
  return (
    record.type === metricBatchMessageType && Array.isArray(record.metrics)
  );
};

export const getComponentName = (componentName: unknown) =>
  typeof componentName === 'string' && componentName.length > 0
    ? componentName
    : 'AnonymousComponent';

const getPositiveIntegerOrDefault = (value: unknown, fallback: number) => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value.trim())
        : NaN;

  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
};

const getNonNegativeNumberOrDefault = (value: unknown, fallback: number) => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value.trim())
        : NaN;

  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
};

export const buildRuntimeOptionArgs = (
  options: TestingPluginOptions,
  metricsOptions: NormalizedMetricsOptions,
  prefixes: RuntimeOptionArgPrefixes
) => {
  const args: string[] = [];

  if (options.domUrl) {
    args.push(`${prefixes.domUrl}${options.domUrl}`);
  }

  if (metricsOptions.enabled) {
    args.push(`${prefixes.metrics}1`);
    args.push(`${prefixes.minMetricMs}${metricsOptions.minDurationMs}`);
  }

  return args;
};

export const normalizeMetricsOptions = (
  metrics: boolean | MetricsOptions | undefined
): NormalizedMetricsOptions => {
  if (metrics === true) {
    return {
      enabled: true,
      topN: DEFAULT_TOP_N,
      minDurationMs: DEFAULT_MIN_DURATION_MS,
    };
  }

  if (!metrics) {
    return {
      enabled: false,
      topN: DEFAULT_TOP_N,
      minDurationMs: DEFAULT_MIN_DURATION_MS,
    };
  }

  const normalized: NormalizedMetricsOptions = {
    enabled: metrics.enabled ?? true,
    topN: getPositiveIntegerOrDefault(metrics.topN, DEFAULT_TOP_N),
    minDurationMs: getNonNegativeNumberOrDefault(
      metrics.minDurationMs,
      DEFAULT_MIN_DURATION_MS
    ),
  };

  if (metrics.reporter) normalized.reporter = metrics.reporter;

  return normalized;
};

export const selectTopSlowestMetrics = (
  metrics: RenderMetric[],
  options: NormalizedMetricsOptions
) =>
  [...metrics]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, options.topN);

export const createMetricsSummary = (
  metrics: RenderMetric[],
  options: NormalizedMetricsOptions
): MetricsSummary | null => {
  if (!options.enabled || metrics.length === 0) return null;

  const topSlowest = selectTopSlowestMetrics(metrics, options);
  if (topSlowest.length === 0) return null;

  return {
    totalCaptured: metrics.length,
    totalReported: topSlowest.length,
    topSlowest,
  };
};

export const printMetricsSummary = (
  summary: MetricsSummary,
  packageTag: string
) => {
  const lines = summary.topSlowest.map(
    (metric) =>
      `  - ${metric.componentName} in ${metric.file}: ${metric.durationMs.toFixed(2)}ms`
  );

  console.log(`\n[${packageTag}] Slowest component renders`);
  for (const line of lines) console.log(line);
};
