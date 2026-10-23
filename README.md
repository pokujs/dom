<div align="center">
<img height="180" alt="Poku Logo" src="https://raw.githubusercontent.com/wellwelwel/poku/main/.github/assets/readme/poku.svg">

# @pokujs/dom

Shared DOM testing core for Poku framework adapters.

</div>

---

@pokujs/dom centralizes cross-framework testing infrastructure used by adapter libraries such as @pokujs/react and @pokujs/vue.

Use this package when building or maintaining framework adapters that need:

- Runtime command injection for Node, Bun, and Deno.
- In-process test environment setup.
- Metrics normalization and reporting.
- happy-dom/jsdom environment bootstrap.
- Shared testing runtime primitives.

## Installation

```bash
npm i @pokujs/dom
```

## Usage

### 1) Build runtime option prefixes and parse flags

```ts
import {
  createRuntimeOptionArgPrefixes,
  parseRuntimeOptions,
} from '@pokujs/dom';

const prefixes = createRuntimeOptionArgPrefixes('poku-react');
const runtimeOptions = parseRuntimeOptions(prefixes);
```

### 2) Create a framework plugin factory

```ts
import {
  createFrameworkTestingPluginFactory,
  type FrameworkDescriptor,
} from '@pokujs/dom';

const descriptor: FrameworkDescriptor = {
  pluginName: 'react-testing',
  packageTag: '@pokujs/react',
  runtimeArgBase: 'poku-react',
  metricMessageType: 'POKU_REACT_RENDER_METRIC',
  metricBatchMessageType: 'POKU_REACT_RENDER_METRIC_BATCH',
};

const { createTestingPlugin } = createFrameworkTestingPluginFactory(
  descriptor,
  import.meta.url
);

export const createReactTestingPlugin = createTestingPlugin;
```

### 3) Reuse DOM setup helpers

```ts
import { setupHappyDomEnvironment, setupJsdomEnvironment } from '@pokujs/dom';
```

### 4) Reuse shared testing runtime helpers

```ts
import {
  createRenderMetricsEmitter,
  createScreen,
  getNow,
} from '@pokujs/dom';
```

## Contracts

Adapter packages should follow these contracts.

### FrameworkDescriptor contract

- pluginName: Plugin registration name.
- packageTag: Human-readable package tag for messages.
- runtimeArgBase: Prefix base used to generate runtime CLI flags.
- metricMessageType: IPC type for single render metrics.
- metricBatchMessageType: IPC type for batch render metrics.
- testFileExtensions (optional): Test file extensions the runner should intercept.

### Runtime options contract

parseRuntimeOptions returns:

- domUrl: DOM URL used by happy-dom/jsdom setup.
- metricsEnabled: Whether metrics collection is active.
- minMetricMs: Drop metrics below this threshold.
- metricBatchSize: Batch size before immediate flush.
- metricFlushMs: Flush interval while buffering.

### Metrics contract

createMetricsSummary returns either null or:

- totalCaptured: Number of collected metrics.
- totalReported: Number of top metrics reported.
- topSlowest: Sorted metrics by duration descending.

### Testing runtime contract

createRenderMetricsEmitter provides:

- emitRenderMetric(componentName, durationMs)
- flushMetricBuffer()
- clearMetricFlushTimer()

These APIs are framework-agnostic. Adapter packages remain responsible for framework-specific semantics such as act, nextTick, render lifecycle, and hook/composable harness behavior.

## Release and CI/CD

This package includes:

- CI build and lint workflows.
- Node, Bun, and Deno compatibility workflows.
- CodeQL workflow and config.
- Release Please + npm publish workflow.

## Development

The next DOM release requires Poku 4.6 or later with the public serializer and assertion-capture APIs.
During review, CI builds the pinned core integration candidate in
`.github/actions/setup-core/action.yml`. Its temporary 4.6.0 package is local to
the CI job; it is not published to npm. Replace this candidate setup with the
released dependency before publishing DOM.

DOM environment setup registers assertion rendering for the active adapter's
real Node implementation. Its actual/expected formatting is limited to 2,000 content characters, 200
visited nodes, and 10 levels of descendants. Truncated output ends with an
ellipsis. Switching adapters replaces the registration; `disposeDomSerializer()`
removes it explicitly when tearing down an environment. DOM-like plain objects
retain Poku's normal object rendering.

Native AssertionError messages and stacks remain unchanged; these formatter
limits do not alter the runtime's own object inspection.

`waitFor` buffers Poku assertion events for each poll. Intermediate failures are
discarded; only the winning poll or final failed poll is reported. Ordinary query
errors remain catchable without changing the process exit status. Testing
Library's timeout error and DOM diagnostic are preserved.

Callbacks invoked by a resource created before polling can bind their listener to
the current attempt:

```ts
await waitFor(
  ({ bind }) =>
    new Promise((resolve, reject) => {
      emitter.once(
        'data',
        bind((value) => {
          try {
            assert.strictEqual(value.status, 'ready');
            resolve(value);
          } catch (error) {
            reject(error);
          }
        }),
      );
    }),
);
```

Always await the callback's work. Assertions that outlive a settled poll are
handled normally and cannot silently fail an already completed attempt.

```bash
npm ci
npm run check
npm run build
```

## Testing

```bash
npm test
npm run test:bun
npm run test:deno
```

## License

MIT
