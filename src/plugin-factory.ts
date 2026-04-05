import type {
  DomAdapter,
  FrameworkDescriptor,
  MetricsSummary,
  RenderMetric,
  TestingPluginOptions,
} from './types.ts';
import { definePlugin } from 'poku/plugins';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import {
  buildRunnerCommand,
  canHandleRuntime,
  createDomSetupPathResolver,
} from './plugin-command.ts';
import {
  buildRuntimeOptionArgs,
  createMetricsSummary,
  getComponentName,
  isRenderMetricBatchMessage,
  isRenderMetricMessage,
  normalizeMetricsOptions,
  printMetricsSummary,
  selectTopSlowestMetrics,
} from './plugin-metrics.ts';
import { setupInProcessEnvironment } from './plugin-setup.ts';
import { createRuntimeOptionArgPrefixes } from './runtime-options.ts';

export type FrameworkPluginInternals = {
  buildRunnerCommand: typeof buildRunnerCommand;
  canHandleRuntime: typeof canHandleRuntime;
  buildRuntimeOptionArgs: typeof buildRuntimeOptionArgs;
  normalizeMetricsOptions: typeof normalizeMetricsOptions;
  selectTopSlowestMetrics: typeof selectTopSlowestMetrics;
  createMetricsSummary: typeof createMetricsSummary;
  getComponentName: typeof getComponentName;
  isRenderMetricMessage: typeof isRenderMetricMessage;
  isRenderMetricBatchMessage: typeof isRenderMetricBatchMessage;
  resolveDomSetupPath: (adapter: DomAdapter | undefined) => string;
};

export const createFrameworkTestingPluginFactory = (
  descriptor: FrameworkDescriptor,
  moduleUrl: string
) => {
  const currentDir = dirname(fileURLToPath(moduleUrl));
  const resolveSetupModulePath = (baseName: string) => {
    const jsPath = resolve(currentDir, `${baseName}.js`);
    if (existsSync(jsPath)) return jsPath;
    return resolve(currentDir, `${baseName}.ts`);
  };

  const happyDomSetupPath = resolveSetupModulePath('dom-setup-happy');
  const jsdomSetupPath = resolveSetupModulePath('dom-setup-jsdom');
  const resolveDomSetupPath = createDomSetupPathResolver(
    descriptor.packageTag,
    happyDomSetupPath,
    jsdomSetupPath
  );

  const prefixes = createRuntimeOptionArgPrefixes(descriptor.runtimeArgBase);
  const extensions = new Set(descriptor.testFileExtensions ?? ['.tsx', '.jsx']);

  const createTestingPlugin = (options: TestingPluginOptions = {}) => {
    let metrics: RenderMetric[] = [];
    let cleanupNodeTsxLoader: (() => void) | undefined;
    const domSetupPath = resolveDomSetupPath(options.dom);
    const metricsOptions = normalizeMetricsOptions(options.metrics);
    const runtimeOptionArgs = buildRuntimeOptionArgs(
      options,
      metricsOptions,
      prefixes
    );

    return definePlugin({
      name: descriptor.pluginName,
      ipc: metricsOptions.enabled,

      async setup(context: any) {
        cleanupNodeTsxLoader = await setupInProcessEnvironment({
          isolation: context.configs.isolation,
          runtime: context.runtime,
          runtimeOptionArgs,
          domSetupPath,
          packageTag: descriptor.packageTag,
        });
      },

      runner(command: string[], file: string) {
        const runtime = command[0];
        if (!runtime) return command;

        const result = descriptor.commandBuilder
          ? descriptor.commandBuilder({ runtime, command, file, domSetupPath, runtimeOptionArgs })
          : buildRunnerCommand({ runtime, command, file, domSetupPath, runtimeOptionArgs, extensions });

        if (!result.shouldHandle) return command;
        return result.command;
      },

      onTestProcess(child: any, file: string) {
        if (!metricsOptions.enabled) return;

        const maybePruneMetrics = () => {
          if (metrics.length > metricsOptions.topN * 10) {
            metrics = selectTopSlowestMetrics(metrics, metricsOptions);
          }
        };

        child.on('message', (message: unknown) => {
          if (
            isRenderMetricBatchMessage(
              message,
              descriptor.metricBatchMessageType
            )
          ) {
            for (const metric of message.metrics) {
              const durationMs = Number(metric.durationMs) || 0;

              metrics.push({
                file,
                componentName: getComponentName(metric.componentName),
                durationMs,
              });
            }

            maybePruneMetrics();
            return;
          }

          if (!isRenderMetricMessage(message, descriptor.metricMessageType)) {
            return;
          }

          const durationMs = Number(message.durationMs) || 0;

          metrics.push({
            file,
            componentName: getComponentName(message.componentName),
            durationMs,
          });

          maybePruneMetrics();
        });
      },

      teardown() {
        cleanupNodeTsxLoader?.();
        cleanupNodeTsxLoader = undefined;

        const summary = createMetricsSummary(metrics, metricsOptions);
        if (!summary) return;

        if (metricsOptions.reporter) {
          metricsOptions.reporter(summary as MetricsSummary);
          return;
        }

        printMetricsSummary(summary, descriptor.packageTag);
      },
    });
  };

  const internals: FrameworkPluginInternals = {
    buildRunnerCommand,
    canHandleRuntime,
    buildRuntimeOptionArgs,
    normalizeMetricsOptions,
    selectTopSlowestMetrics,
    createMetricsSummary,
    getComponentName,
    isRenderMetricMessage,
    isRenderMetricBatchMessage,
    resolveDomSetupPath,
  };

  return {
    createTestingPlugin,
    resolveDomSetupPath,
    runtimeOptionArgPrefixes: prefixes,
    internals,
  };
};
