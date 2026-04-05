import type { Screen } from '@testing-library/dom';
import { getQueriesForElement } from '@testing-library/dom';
import type { RuntimeOptions } from './types.ts';

export const getNow: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now.bind(performance)
    : Date.now.bind(Date);

type QueuedRenderMetric = {
  componentName: string;
  durationMs: number;
};

type MetricsRuntimeState = {
  metricBuffer: QueuedRenderMetric[];
  metricFlushTimer: ReturnType<typeof setTimeout> | undefined;
  metricsChannelClosed: boolean;
  listenersRegistered: boolean;
};

type RuntimeStateGlobal = typeof globalThis & {
  [symbol: symbol]: MetricsRuntimeState | undefined;
};

export type RenderMetricsEmitterOptions = {
  runtimeOptions: RuntimeOptions;
  metricsStateKey: symbol;
  metricsBatchMessageType: string;
};

const getMetricsRuntimeState = (
  stateKey: symbol
): MetricsRuntimeState => {
  const stateGlobal = globalThis as RuntimeStateGlobal;

  if (!stateGlobal[stateKey]) {
    stateGlobal[stateKey] = {
      metricBuffer: [],
      metricFlushTimer: undefined,
      metricsChannelClosed: false,
      listenersRegistered: false,
    };
  }

  return stateGlobal[stateKey]!;
};

export const createRenderMetricsEmitter = (
  options: RenderMetricsEmitterOptions
) => {
  const { runtimeOptions, metricsStateKey, metricsBatchMessageType } = options;
  const metricsState = getMetricsRuntimeState(metricsStateKey);

  const clearMetricFlushTimer = () => {
    if (!metricsState.metricFlushTimer) return;
    clearTimeout(metricsState.metricFlushTimer);
    metricsState.metricFlushTimer = undefined;
  };

  const flushMetricBuffer = () => {
    if (!runtimeOptions.metricsEnabled || typeof process.send !== 'function') {
      return;
    }

    if (process.connected === false) {
      metricsState.metricBuffer.length = 0;
      metricsState.metricsChannelClosed = true;
      return;
    }

    if (
      metricsState.metricsChannelClosed ||
      metricsState.metricBuffer.length === 0
    ) {
      return;
    }

    const payload = metricsState.metricBuffer.splice(
      0,
      metricsState.metricBuffer.length
    );

    try {
      process.send({
        type: metricsBatchMessageType,
        metrics: payload,
      });
    } catch {
      metricsState.metricsChannelClosed = true;
      metricsState.metricBuffer.length = 0;
    }
  };

  const scheduleMetricFlush = () => {
    if (metricsState.metricFlushTimer) return;

    metricsState.metricFlushTimer = setTimeout(() => {
      metricsState.metricFlushTimer = undefined;
      flushMetricBuffer();
    }, runtimeOptions.metricFlushMs);

    metricsState.metricFlushTimer.unref?.();
  };

  if (runtimeOptions.metricsEnabled && !metricsState.listenersRegistered) {
    metricsState.listenersRegistered = true;

    process.on('beforeExit', () => {
      clearMetricFlushTimer();
      flushMetricBuffer();
    });

    process.on('disconnect', () => {
      clearMetricFlushTimer();
      metricsState.metricBuffer.length = 0;
      metricsState.metricsChannelClosed = true;
    });
  }

  const emitRenderMetric = (componentName: string, durationMs: number) => {
    if (
      !runtimeOptions.metricsEnabled ||
      typeof process.send !== 'function'
    ) {
      return;
    }

    if (process.connected === false || metricsState.metricsChannelClosed) {
      metricsState.metricBuffer.length = 0;
      metricsState.metricsChannelClosed = true;
      clearMetricFlushTimer();
      return;
    }

    const safeDuration =
      Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;

    if (safeDuration < runtimeOptions.minMetricMs) return;

    metricsState.metricBuffer.push({
      componentName,
      durationMs: safeDuration,
    });

    if (metricsState.metricBuffer.length >= runtimeOptions.metricBatchSize) {
      clearMetricFlushTimer();
      flushMetricBuffer();
      return;
    }

    scheduleMetricFlush();
  };

  return {
    emitRenderMetric,
    flushMetricBuffer,
    clearMetricFlushTimer,
  };
};

export const createScreen = (): Screen => {
  return new Proxy({} as Screen, {
    get(_target, prop) {
      const baseScreenQueries = getQueriesForElement(document.body);
      const value = Reflect.get(baseScreenQueries, prop, baseScreenQueries);
      return typeof value === 'function'
        ? value.bind(baseScreenQueries)
        : value;
    },
  }) as Screen;
};
