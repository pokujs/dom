import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { canHandleRuntime, isNodeRuntime } from './plugin-command.ts';

type TsxEsmApiModule = {
  register?: () => () => void;
};

const TSX_LOADER_MODULE = 'tsx/esm/api';

// Once tsx is registered in a Node.js process it cannot be safely deregistered
// and re-registered (tsx's hook worker re-instantiation fails with an invalid
// URL scheme). Under isolation:'none' everything runs in the same process for
// its lifetime, so keeping the loader registered permanently is correct.
const TSX_LOADER_REGISTERED_KEY = Symbol.for('@pokujs/dom.tsx-loader-registered');
type GlobalWithTsxFlag = typeof globalThis & { [TSX_LOADER_REGISTERED_KEY]?: boolean };

const appendMissingRuntimeArgs = (runtimeOptionArgs: string[]) => {
  for (const arg of runtimeOptionArgs) {
    if (process.argv.includes(arg)) continue;
    process.argv.push(arg);
  }
};

const loadDomSetupModule = async (domSetupPath: string) => {
  await import(pathToFileURL(domSetupPath).href);
};

const registerNodeTsxLoader = async (packageTag: string): Promise<() => void> => {
  const g = globalThis as GlobalWithTsxFlag;

  if (g[TSX_LOADER_REGISTERED_KEY]) return () => {};

  const requireFromCwd = createRequire(`${process.cwd()}/`);

  try {
    const resolvedModulePath = requireFromCwd.resolve(TSX_LOADER_MODULE);
    const mod = (await import(pathToFileURL(resolvedModulePath).href)) as TsxEsmApiModule;
    if (typeof mod.register !== 'function') {
      throw new Error('Missing register() export from tsx loader API');
    }

    mod.register();
    g[TSX_LOADER_REGISTERED_KEY] = true;
    return () => {};
  } catch (error) {
    throw new Error(
      `[${packageTag}] isolation "none" in Node.js requires a working "tsx" installation to load .tsx/.jsx test files.`,
      { cause: error }
    );
  }
};

export type InProcessSetupOptions = {
  isolation: string | undefined;
  runtime: string;
  runtimeOptionArgs: string[];
  domSetupPath: string;
  packageTag: string;
};

export const setupInProcessEnvironment = async (
  options: InProcessSetupOptions
): Promise<(() => void) | undefined> => {
  if (options.isolation !== 'none') return undefined;
  if (!canHandleRuntime(options.runtime)) return undefined;

  let cleanupNodeTsxLoader: (() => void) | undefined;

  if (isNodeRuntime(options.runtime)) {
    cleanupNodeTsxLoader = await registerNodeTsxLoader(options.packageTag);
  }

  appendMissingRuntimeArgs(options.runtimeOptionArgs);
  await loadDomSetupModule(options.domSetupPath);

  return cleanupNodeTsxLoader;
};
