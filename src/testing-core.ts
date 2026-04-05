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
  // Cache the bound query object per document.body reference.
  // getQueriesForElement() is not free — it traverses all bound queries.
  // The Proxy previously called it on every single property access; caching
  // by body reference avoids redundant work while still picking up a new body
  // when JSDOM reinitialises it (e.g. between test files under isolation:none).
  let cachedBody: HTMLElement | null = null;
  let cachedQueries: ReturnType<typeof getQueriesForElement> | null = null;

  const getQueries = () => {
    const body = document.body;
    if (body !== cachedBody) {
      cachedBody = body;
      cachedQueries = getQueriesForElement(body);
    }
    return cachedQueries!;
  };

  return new Proxy({} as Screen, {
    get(_target, prop) {
      const boundQueries = getQueries();
      const value = Reflect.get(boundQueries, prop, boundQueries);
      return typeof value === 'function' ? value.bind(boundQueries) : value;
    },
  }) as Screen;
};

/**
 * Copies all properties of `base` onto `target`, wrapping every function value
 * with `wrapFn` so frameworks can inject their own flush/sync step (React `act`,
 * Vue `nextTick`, etc.) without duplicating the iteration boilerplate.
 *
 * @param target  The object to receive the wrapped methods (typically the new fireEvent function).
 * @param base    The original object whose methods should be wrapped.
 * @param wrapFn  Receives a zero-argument invoker; its return value is the new return value.
 */
export const wrapFireEventMethods = (
  target: Record<string, unknown>,
  base: Record<string, unknown>,
  wrapFn: (invoke: () => unknown) => unknown
): void => {
  for (const key of Object.keys(base)) {
    const value = base[key];
    if (typeof value !== 'function') {
      target[key] = value;
    } else {
      target[key] = (...args: unknown[]) =>
        wrapFn(() => Reflect.apply(value, base, args));
    }
  }
};

