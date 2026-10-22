import type {
  PrettyDOMOptions,
  Screen,
  waitForOptions,
} from '@testing-library/dom';
import {
  configure as configureDomTestingLibrary,
  getQueriesForElement,
  logDOM,
  queries,
  waitFor as baseWaitFor,
} from '@testing-library/dom';

export { configureDomTestingLibrary };
import type { RuntimeOptions } from './types.ts';

export const getNow: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now.bind(performance)
    : Date.now.bind(Date);

type QueuedRenderMetric = {
  componentName: string;
  durationMs: number;
};

export type InProcessMetricReceiver = (message: {
  type: string;
  metrics: QueuedRenderMetric[];
}) => void;

const IN_PROCESS_METRIC_RECEIVER_KEY = Symbol.for(
  '@pokujs/dom.in-process-metric-receiver'
);

type MetricsRuntimeState = {
  metricBuffer: QueuedRenderMetric[];
  metricFlushTimer: ReturnType<typeof setTimeout> | undefined;
  metricsChannelClosed: boolean;
  listenersRegistered: boolean;
};

type RuntimeStateGlobal = typeof globalThis & {
  [symbol: symbol]: unknown;
};

export const setInProcessMetricReceiver = (
  receiver: InProcessMetricReceiver | undefined
) => {
  const g = globalThis as RuntimeStateGlobal;
  g[IN_PROCESS_METRIC_RECEIVER_KEY] = receiver;
};

const getInProcessMetricReceiver = (): InProcessMetricReceiver | undefined => {
  const g = globalThis as RuntimeStateGlobal;
  const fn = g[IN_PROCESS_METRIC_RECEIVER_KEY];
  return typeof fn === 'function' ? (fn as InProcessMetricReceiver) : undefined;
};

export type RenderMetricsEmitterOptions = {
  runtimeOptions: RuntimeOptions | (() => RuntimeOptions);
  metricsStateKey: symbol;
  metricsBatchMessageType: string;
};

const getMetricsRuntimeState = (stateKey: symbol): MetricsRuntimeState => {
  const stateGlobal = globalThis as RuntimeStateGlobal;

  if (!stateGlobal[stateKey]) {
    stateGlobal[stateKey] = {
      metricBuffer: [],
      metricFlushTimer: undefined,
      metricsChannelClosed: false,
      listenersRegistered: false,
    };
  }

  return stateGlobal[stateKey] as MetricsRuntimeState;
};

export const createRenderMetricsEmitter = (
  options: RenderMetricsEmitterOptions
) => {
  const { metricsStateKey, metricsBatchMessageType } = options;
  const resolveRuntimeOptions = (): RuntimeOptions =>
    typeof options.runtimeOptions === 'function'
      ? options.runtimeOptions()
      : options.runtimeOptions;
  const metricsState = getMetricsRuntimeState(metricsStateKey);

  const canSendMetrics = () =>
    typeof process.send === 'function' ||
    typeof getInProcessMetricReceiver() === 'function';

  const clearMetricFlushTimer = () => {
    if (!metricsState.metricFlushTimer) return;
    clearTimeout(metricsState.metricFlushTimer);
    metricsState.metricFlushTimer = undefined;
  };

  const ensureProcessListeners = (runtimeOptions: RuntimeOptions) => {
    if (!runtimeOptions.metricsEnabled || metricsState.listenersRegistered) {
      return;
    }
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

    // Adding a 'disconnect' listener on `process` in Node.js automatically
    // calls `process.channel.ref()`, which prevents the child test process
    // from ever reaching `beforeExit` or exiting while the parent waits for it.
    // Unref the IPC channel so the child exits naturally once tests complete.
    const procWithChannel = process as typeof process & {
      channel?: { unref?: () => void };
    };
    procWithChannel.channel?.unref?.();
  };

  const flushMetricBuffer = () => {
    const runtimeOptions = resolveRuntimeOptions();
    if (!runtimeOptions.metricsEnabled || !canSendMetrics()) {
      return;
    }

    const inProcessReceiver = getInProcessMetricReceiver();
    if (!inProcessReceiver && process.connected === false) {
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

    const message = {
      type: metricsBatchMessageType,
      metrics: payload,
    };

    if (inProcessReceiver) {
      inProcessReceiver(message);
      return;
    }

    try {
      process.send!(message);
    } catch {
      metricsState.metricsChannelClosed = true;
      metricsState.metricBuffer.length = 0;
    }
  };

  const scheduleMetricFlush = (runtimeOptions: RuntimeOptions) => {
    if (metricsState.metricFlushTimer) return;

    metricsState.metricFlushTimer = setTimeout(() => {
      metricsState.metricFlushTimer = undefined;
      flushMetricBuffer();
    }, runtimeOptions.metricFlushMs);

    metricsState.metricFlushTimer.unref?.();
  };

  const emitRenderMetric = (componentName: string, durationMs: number) => {
    const runtimeOptions = resolveRuntimeOptions();
    if (!runtimeOptions.metricsEnabled || !canSendMetrics()) {
      return;
    }

    ensureProcessListeners(runtimeOptions);

    const inProcessReceiver = getInProcessMetricReceiver();
    if (
      (!inProcessReceiver && process.connected === false) ||
      metricsState.metricsChannelClosed
    ) {
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

    scheduleMetricFlush(runtimeOptions);
  };

  return {
    emitRenderMetric,
    flushMetricBuffer,
    clearMetricFlushTimer,
  };
};

const debugScreen = (
  element?: Array<Element | HTMLDocument> | Element | HTMLDocument,
  maxLength?: number,
  options?: Parameters<typeof logDOM>[2]
) => {
  if (Array.isArray(element)) {
    for (const el of element) logDOM(el, maxLength, options);
    return;
  }
  logDOM(element ?? document.body, maxLength, options);
};

const logTestingPlaygroundURL = (element: Element = document.body) => {
  if (!element || !('innerHTML' in element)) {
    console.log(`The element you're providing isn't a valid DOM element.`);
    return;
  }
  if (!element.innerHTML) {
    console.log(`The provided element doesn't have any children.`);
    return;
  }
  const unindented = element.innerHTML.replace(/[ \t]*[\n][ \t]*/g, '\n');
  const playgroundUrl = `https://testing-playground.com/#markup=${encodeURIComponent(unindented)}`;
  console.log(`Open this URL in your browser\n\n${playgroundUrl}`);
  return playgroundUrl;
};

export const createScreen = (): Screen => {
  // Cache the bound query object per document.body reference.
  // getQueriesForElement() is not free — it traverses all bound queries.
  // Caching by body reference avoids redundant work while still picking up a
  // new body when JSDOM or Happy DOM reinitialises it (e.g. between test suites
  // under isolation:none).
  let cachedBody: HTMLElement | null = null;
  let cachedQueries: Screen | null = null;

  const getQueries = (): Screen => {
    const body = document.body;
    if (body !== cachedBody || !cachedQueries) {
      cachedBody = body;
      cachedQueries = Object.assign(getQueriesForElement(body, queries), {
        debug: debugScreen,
        logTestingPlaygroundURL,
      }) as Screen;
    }
    return cachedQueries;
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
export const createAsFragment =
  (container: Element) => (): DocumentFragment => {
    if (typeof document.createRange === 'function') {
      return document
        .createRange()
        .createContextualFragment(container.innerHTML);
    }
    const template = document.createElement('template');
    template.innerHTML = container.innerHTML;
    return template.content;
  };

export const createDebug =
  (baseElement: Element | HTMLDocument) =>
  (
    element:
      | Array<Element | HTMLDocument>
      | Element
      | HTMLDocument = baseElement,
    maxLength?: number,
    options?: PrettyDOMOptions
  ): void => {
    if (Array.isArray(element)) {
      for (const el of element) logDOM(el, maxLength, options);
      return;
    }
    logDOM(element, maxLength, options);
  };

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

const POKU_RETRY_CONTEXT_KEY = Symbol.for('@poku/retryContext');
const POKU_DEFERRED_ASSERTION_KEY = Symbol.for('@poku/deferred-assertion');

type PokuRetryContextEntry = {
  attempts: number;
  currentAttempt: number;
  delay: number;
  failed: boolean;
  silent?: boolean;
};

type PokuRetryState = {
  run?: <Result>(
    entry: PokuRetryContextEntry,
    callback: () => Result
  ) => Result;
};

export const createWaitFor =
  (waitForImpl: typeof baseWaitFor = baseWaitFor) =>
  async <T>(
    callback: () => Promise<T> | T,
    options?: waitForOptions
  ): Promise<T> => {
    const wrappedCallback = (): Promise<T> | T => {
      const retryState = (globalThis as RuntimeStateGlobal)[
        POKU_RETRY_CONTEXT_KEY
      ] as PokuRetryState | undefined;

      if (!retryState?.run) return callback();
      const entry: PokuRetryContextEntry = {
        attempts: 1,
        currentAttempt: 1,
        delay: 0,
        failed: false,
        silent: true,
      };
      return retryState.run(entry, callback);
    };

    try {
      return await waitForImpl(wrappedCallback, options);
    } catch (error) {
      const deferred = (error as unknown as Record<symbol, unknown>)?.[
        POKU_DEFERRED_ASSERTION_KEY
      ];
      if (typeof deferred === 'function') {
        (deferred as () => void)();
      }
      throw error;
    }
  };

export const waitFor = createWaitFor(baseWaitFor);
