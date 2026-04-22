import { assert, test } from 'poku';
import {
  buildRunnerCommand,
  canHandleRuntime,
} from '../src/plugin-command.ts';

test('canHandleRuntime supports node bun and deno', async () => {
  assert.strictEqual(canHandleRuntime('node'), true);
  assert.strictEqual(canHandleRuntime('bun'), true);
  assert.strictEqual(canHandleRuntime('deno'), true);
  assert.strictEqual(canHandleRuntime('python'), false);
});

test('buildRunnerCommand injects runtime setup flags', async () => {
  const result = buildRunnerCommand({
    runtime: 'node',
    command: ['node', '--trace-warnings', 'tests/example.test.tsx'],
    file: 'tests/example.test.tsx',
    domSetupPath: '/tmp/dom-setup.ts',
    runtimeOptionArgs: ['--poku-dom-metrics=1'],
    extensions: new Set(['.tsx', '.jsx']),
  });

  assert.strictEqual(result.shouldHandle, true);
  assert.deepStrictEqual(result.command, [
    'node',
    '--trace-warnings',
    '--import=tsx',
    '--import=/tmp/dom-setup.ts',
    'tests/example.test.tsx',
    '--poku-dom-metrics=1',
  ]);
});

test('buildRunnerCommand injects --preload for Bun (not --import)', async () => {
  const result = buildRunnerCommand({
    runtime: 'bun',
    command: ['bun', 'tests/example.test.tsx'],
    file: 'tests/example.test.tsx',
    domSetupPath: '/tmp/dom-setup.ts',
    runtimeOptionArgs: [],
    extensions: new Set(['.tsx', '.jsx']),
  });

  assert.strictEqual(result.shouldHandle, true);
  assert.deepStrictEqual(result.command, [
    'bun',
    '--preload /tmp/dom-setup.ts',
    'tests/example.test.tsx',
  ]);
});

test('buildRunnerCommand leaves unsupported files unchanged', async () => {
  const command = ['node', 'tests/example.test.ts'];
  const result = buildRunnerCommand({
    runtime: 'node',
    command,
    file: 'tests/example.test.ts',
    domSetupPath: '/tmp/dom-setup.ts',
    runtimeOptionArgs: [],
    extensions: new Set(['.tsx', '.jsx']),
  });

  assert.strictEqual(result.shouldHandle, false);
  assert.deepStrictEqual(result.command, command);
});
