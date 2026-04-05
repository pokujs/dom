import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { RuntimeOptions } from './types.ts';

type SetupDomEnvironmentOptions = {
  runtimeOptions: RuntimeOptions;
  packageTag: string;
  enableReactActEnvironment?: boolean;
};

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const applyReactActEnvironment = (enabled: boolean) => {
  if (!enabled) return;
  const reactGlobal = globalThis as ReactActGlobal;
  if (typeof reactGlobal.IS_REACT_ACT_ENVIRONMENT === 'undefined') {
    reactGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  }
};

export const setupHappyDomEnvironment = async (
  options: SetupDomEnvironmentOptions
) => {
  if (!globalThis.window || !globalThis.document) {
    GlobalRegistrator.register({
      url: options.runtimeOptions.domUrl,
    });

    const nativeDispatchEvent = globalThis.window.dispatchEvent;
    if (typeof nativeDispatchEvent === 'function') {
      globalThis.dispatchEvent = nativeDispatchEvent.bind(globalThis.window);
    }
  }

  applyReactActEnvironment(Boolean(options.enableReactActEnvironment));
};

const defineGlobal = (key: keyof typeof globalThis, value: unknown) => {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
};

export const setupJsdomEnvironment = async (
  options: SetupDomEnvironmentOptions
) => {
  if (!globalThis.window || !globalThis.document) {
    let mod: typeof import('jsdom');

    try {
      mod = await import('jsdom');
    } catch {
      throw new Error(
        `[${options.packageTag}] DOM adapter "jsdom" requires the "jsdom" package. Install it with "npm install --save-dev jsdom".`
      );
    }

    const { JSDOM } = mod;
    const dom = new JSDOM('', {
      url: options.runtimeOptions.domUrl,
      pretendToBeVisual: true,
    });

    defineGlobal('window', dom.window as unknown as Window & typeof globalThis);
    defineGlobal('document', dom.window.document);
    defineGlobal('navigator', dom.window.navigator);
    defineGlobal('HTMLElement', dom.window.HTMLElement);
    defineGlobal('Element', dom.window.Element);
    defineGlobal('Node', dom.window.Node);
    defineGlobal('Text', dom.window.Text);
    defineGlobal('SVGElement', dom.window.SVGElement);
    defineGlobal('Event', dom.window.Event);
    defineGlobal('CustomEvent', dom.window.CustomEvent);
    defineGlobal('MutationObserver', dom.window.MutationObserver);
    defineGlobal('requestAnimationFrame', dom.window.requestAnimationFrame);
    defineGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame);
  }

  applyReactActEnvironment(Boolean(options.enableReactActEnvironment));
};
