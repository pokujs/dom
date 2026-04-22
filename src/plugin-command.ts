import type { DomAdapter } from './types.ts';
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

export type RuntimeSupport = {
  supportsNodeLikeImport: boolean;
  supportsDenoPreload: boolean;
};

export type BuildRunnerCommandInput = {
  runtime: string;
  command: string[];
  file: string;
  domSetupPath: string;
  runtimeOptionArgs: string[];
  extensions: Set<string>;
};

export type BuildRunnerCommandOutput = {
  shouldHandle: boolean;
  command: string[];
};

const isTsxImport = (arg: string) =>
  arg === '--import=tsx' || arg === '--loader=tsx';

export const isNodeRuntime = (runtime: string) => runtime === 'node';
const isBunRuntime = (runtime: string) => runtime === 'bun';
const isDenoRuntime = (runtime: string) => runtime === 'deno';

export const getRuntimeSupport = (runtime: string): RuntimeSupport => ({
  supportsNodeLikeImport: isNodeRuntime(runtime) || isBunRuntime(runtime),
  supportsDenoPreload: isDenoRuntime(runtime),
});

export const canHandleRuntime = (runtime: string) => {
  const support = getRuntimeSupport(runtime);
  return support.supportsNodeLikeImport || support.supportsDenoPreload;
};

export const createDomSetupPathResolver = (
  packageTag: string,
  happyDomSetupPath: string,
  jsdomSetupPath: string
) => {
  return (adapter: DomAdapter | undefined) => {
    if (!adapter || adapter === 'happy-dom') return happyDomSetupPath;
    if (adapter === 'jsdom') return jsdomSetupPath;

    const customPath = resolve(process.cwd(), adapter.setupModule);

    if (!existsSync(customPath)) {
      throw new Error(
        `[${packageTag}] Custom DOM setup module not found: "${customPath}"\n` +
          'Check the "dom.setupModule" option in your poku.config.js.'
      );
    }

    return customPath;
  };
};

export const buildRunnerCommand = ({
  runtime,
  command,
  file,
  domSetupPath,
  runtimeOptionArgs,
  extensions,
}: BuildRunnerCommandInput): BuildRunnerCommandOutput => {
  const support = getRuntimeSupport(runtime);

  if (!support.supportsNodeLikeImport && !support.supportsDenoPreload) {
    return { shouldHandle: false, command };
  }

  if (!extensions.has(extname(file))) {
    return { shouldHandle: false, command };
  }

  const fileIndex = command.lastIndexOf(file);
  if (fileIndex === -1) return { shouldHandle: false, command };

  const nodeImportFlag = `--import=${domSetupPath}`;
  const bunPreloadFlag = `--preload ${domSetupPath}`;
  const denoPreloadFlag = `--preload=${domSetupPath}`;
  const beforeFile: string[] = [];
  const afterFile: string[] = [];

  let hasTsx = false;
  let hasNodeLikeDomSetup = false;
  let hasDenoDomSetup = false;
  const existingArgs = new Set<string>();

  for (let index = 1; index < command.length; index += 1) {
    const arg = command[index];
    if (typeof arg !== 'string') continue;

    existingArgs.add(arg);

    if (index < fileIndex) {
      beforeFile.push(arg);

      if (isTsxImport(arg)) hasTsx = true;
      else if (arg === nodeImportFlag) hasNodeLikeDomSetup = true;
      else if (arg === denoPreloadFlag) hasDenoDomSetup = true;
      continue;
    }

    if (index > fileIndex) {
      afterFile.push(arg);
    }
  }

  const extraImports: string[] = [];
  if (isNodeRuntime(runtime) && !hasTsx) extraImports.push('--import=tsx');
  if (support.supportsNodeLikeImport && !hasNodeLikeDomSetup) {
    if (isBunRuntime(runtime)) {
      extraImports.push(bunPreloadFlag);
    } else {
      extraImports.push(nodeImportFlag);
    }
  }
  if (support.supportsDenoPreload && !hasDenoDomSetup) {
    extraImports.push(denoPreloadFlag);
  }

  const runtimeArgsToInject: string[] = [];
  for (const runtimeOptionArg of runtimeOptionArgs) {
    if (existingArgs.has(runtimeOptionArg)) continue;
    runtimeArgsToInject.push(runtimeOptionArg);
  }

  return {
    shouldHandle: true,
    command: [
      runtime,
      ...beforeFile,
      ...extraImports,
      file,
      ...runtimeArgsToInject,
      ...afterFile,
    ],
  };
};
