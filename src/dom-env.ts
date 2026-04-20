import { GlobalWindow } from 'happy-dom';
import type { RuntimeOptions } from './types.ts';
import { registerScopeHooks } from './test-scope.ts';

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

const defineGlobal = (key: keyof typeof globalThis, value: unknown) => {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
};

export const setupHappyDomEnvironment = async (
  options: SetupDomEnvironmentOptions
) => {
  registerScopeHooks();

  if (!globalThis.window || !globalThis.document) {
    // Save native event primitives before installing Happy DOM globals.
    // Deno's runtime calls globalThis.dispatchEvent('beforeunload') on exit
    // using its own native Event constructor — if Happy DOM's dispatchEvent
    // is installed instead, the type check inside it throws a TypeError.
    const existingDispatchEvent = globalThis.dispatchEvent;
    const existingEvent = globalThis.Event;
    const existingCustomEvent = globalThis.CustomEvent;

    const happyWindow = new GlobalWindow({ url: options.runtimeOptions.domUrl });

    defineGlobal('window', happyWindow);
    defineGlobal('document', happyWindow.document);
    defineGlobal('navigator', happyWindow.navigator);
    defineGlobal('HTMLElement', happyWindow.HTMLElement);
    defineGlobal('Element', happyWindow.Element);
    defineGlobal('Node', happyWindow.Node);
    defineGlobal('Text', happyWindow.Text);
    defineGlobal('SVGElement', happyWindow.SVGElement);
    defineGlobal('MutationObserver', happyWindow.MutationObserver);
    defineGlobal('requestAnimationFrame', happyWindow.requestAnimationFrame);
    defineGlobal('cancelAnimationFrame', happyWindow.cancelAnimationFrame);

    // Prefer the runtime's native Event constructors so that Deno's internal
    // event dispatch (e.g. beforeunload) continues to work correctly.
    defineGlobal('Event', typeof existingEvent === 'function' ? existingEvent : happyWindow.Event);
    defineGlobal('CustomEvent', typeof existingCustomEvent === 'function' ? existingCustomEvent : happyWindow.CustomEvent);

    if (typeof existingDispatchEvent === 'function') {
      globalThis.dispatchEvent = existingDispatchEvent;
    } else {
      globalThis.dispatchEvent = happyWindow.dispatchEvent.bind(happyWindow) as unknown as typeof globalThis.dispatchEvent;
    }
  }

  applyReactActEnvironment(Boolean(options.enableReactActEnvironment));
};

export const setupJsdomEnvironment = async (
  options: SetupDomEnvironmentOptions
) => {
  registerScopeHooks();

  if (!globalThis.window || !globalThis.document) {
    let mod: typeof import('jsdom');

    try {
      mod = await import('jsdom');
    } catch {
      throw new Error(
        `[${options.packageTag}] DOM adapter "jsdom" requires the "jsdom" package. Install it with "npm install --save-dev jsdom".`
      );
    }

    // Save native event primitives before jsdom replaces them.
    // Deno's runtime teardown fires dispatchLoadEvent() on process exit using
    // its own native Event constructor — if jsdom's Event is installed instead,
    // setTarget() receives undefined and throws "Cannot set properties of
    // undefined (setting 'target')".
    const existingDispatchEvent = globalThis.dispatchEvent;
    const existingEvent = globalThis.Event;
    const existingCustomEvent = globalThis.CustomEvent;

    const { JSDOM } = mod;
    const dom = new JSDOM('', {
      url: options.runtimeOptions.domUrl,
      pretendToBeVisual: true,
    });

    defineGlobal('window', dom.window);
    defineGlobal('document', dom.window.document);
    defineGlobal('navigator', dom.window.navigator);
    defineGlobal('HTMLElement', dom.window.HTMLElement);
    defineGlobal('Element', dom.window.Element);
    defineGlobal('Node', dom.window.Node);
    defineGlobal('Text', dom.window.Text);
    defineGlobal('SVGElement', dom.window.SVGElement);
    defineGlobal('MutationObserver', dom.window.MutationObserver);
    defineGlobal('requestAnimationFrame', dom.window.requestAnimationFrame);
    defineGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame);

    // Prefer the runtime's native Event constructors so that Deno's internal
    // event dispatch (e.g. load/beforeunload) continues to work correctly.
    defineGlobal('Event', typeof existingEvent === 'function' ? existingEvent : dom.window.Event);
    defineGlobal('CustomEvent', typeof existingCustomEvent === 'function' ? existingCustomEvent : dom.window.CustomEvent);

    if (typeof existingDispatchEvent === 'function') {
      globalThis.dispatchEvent = existingDispatchEvent;
    } else {
      globalThis.dispatchEvent = dom.window.dispatchEvent.bind(dom.window) as unknown as typeof globalThis.dispatchEvent;
    }
  }

  applyReactActEnvironment(Boolean(options.enableReactActEnvironment));
};
