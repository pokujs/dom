export type DomAdapter = 'happy-dom' | 'jsdom' | { setupModule: string };

export type RenderMetric = {
  file: string;
  componentName: string;
  durationMs: number;
};

export type MetricsSummary = {
  totalCaptured: number;
  totalReported: number;
  topSlowest: RenderMetric[];
};

export type MetricsOptions = {
  enabled?: boolean;
  topN?: number;
  minDurationMs?: number;
  reporter?: (summary: MetricsSummary) => void;
};

export type TestingPluginOptions = {
  dom?: DomAdapter;
  domUrl?: string;
  metrics?: boolean | MetricsOptions;
};

export type NormalizedMetricsOptions = {
  enabled: boolean;
  topN: number;
  minDurationMs: number;
  reporter?: (summary: MetricsSummary) => void;
};

export type RuntimeOptionArgPrefixes = {
  metrics: string;
  minMetricMs: string;
  domUrl: string;
  metricBatchSize: string;
  metricFlushMs: string;
};

export type RuntimeOptions = {
  domUrl: string;
  metricsEnabled: boolean;
  minMetricMs: number;
  metricBatchSize: number;
  metricFlushMs: number;
};

export type FrameworkDescriptor = {
  pluginName: string;
  packageTag: string;
  runtimeArgBase: string;
  metricMessageType: string;
  metricBatchMessageType: string;
  testFileExtensions?: string[];
  commandBuilder?: (input: {
    runtime: string;
    command: string[];
    file: string;
    domSetupPath: string;
    runtimeOptionArgs: string[];
  }) => { shouldHandle: boolean; command: string[] };
};
