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

const DOM_ADAPTER_KEY = Symbol.for('@pokujs/dom.active-adapter');

type DomGlobalState = typeof globalThis & {
  [DOM_ADAPTER_KEY]?: 'happy-dom' | 'jsdom';
};

const applyReactActEnvironment = (enabled: boolean) => {
  if (!enabled) return;
  const reactGlobal = globalThis as ReactActGlobal;
  if (typeof reactGlobal.IS_REACT_ACT_ENVIRONMENT === 'undefined') {
    reactGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  }
};

const defineGlobal = (key: string, value: unknown) => {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
  Reflect.set(globalThis, key, value);
};

const SHARED_DOM_GLOBALS = [
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLFormElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'HTMLOptionElement',
  'HTMLAnchorElement',
  'HTMLImageElement',
  'HTMLTemplateElement',
  'HTMLSlotElement',
  'HTMLDialogElement',
  'HTMLLabelElement',
  'HTMLOutputElement',
  'SVGElement',
  'Text',
  'Comment',
  'DocumentFragment',
  'Document',
  'ShadowRoot',
  'NodeFilter',
  'NodeList',
  'HTMLCollection',
  'DOMTokenList',
  'CSSStyleDeclaration',
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'CustomElementRegistry',
  'DOMParser',
  'XMLSerializer',
  'Range',
  'Selection',
  'UIEvent',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'InputEvent',
  'PointerEvent',
  'TouchEvent',
  'WheelEvent',
  'AnimationEvent',
  'TransitionEvent',
  'ClipboardEvent',
  'DragEvent',
  'SubmitEvent',
  'PopStateEvent',
  'HashChangeEvent',
  'StorageEvent',
] as const;

const BOUND_WINDOW_METHODS = [
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'matchMedia',
  'scrollTo',
  'scrollBy',
  'alert',
  'confirm',
  'prompt',
] as const;

const ensureBrowserApiPolyfills = (win: Record<string, any>) => {
  if (typeof win.matchMedia !== 'function') {
    win.matchMedia = (query: string) => ({
      matches: false,
      media: String(query),
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  if (typeof win.ResizeObserver !== 'function') {
    win.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (typeof win.IntersectionObserver !== 'function') {
    win.IntersectionObserver = class IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds = [0];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }

  if (
    win.HTMLElement?.prototype &&
    typeof win.HTMLElement.prototype.scrollIntoView !== 'function'
  ) {
    win.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
  }
};

const installWindowGlobals = (win: Record<string, any>) => {
  ensureBrowserApiPolyfills(win);

  // Save native event primitives before installing DOM globals when running under Deno.
  // Deno's runtime calls globalThis.dispatchEvent('beforeunload') / 'load' on exit
  // using its own native Event constructor — if the DOM adapter's Event/dispatchEvent
  // is installed on Deno's globalThis, Deno's exit handler throws a TypeError.
  const isDeno =
    typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';
  const existingDispatchEvent = globalThis.dispatchEvent;
  const existingEvent = globalThis.Event;
  const existingCustomEvent = globalThis.CustomEvent;

  defineGlobal('window', win);
  defineGlobal('self', win);

  for (const key of SHARED_DOM_GLOBALS) {
    if (key in win && win[key] !== undefined) {
      defineGlobal(key, win[key]);
    }
  }

  for (const method of BOUND_WINDOW_METHODS) {
    if (typeof win[method] === 'function') {
      defineGlobal(method, win[method].bind(win));
    }
  }

  if (typeof win.customElements !== 'undefined') {
    defineGlobal('customElements', win.customElements);
  }

  if (isDeno) {
    defineGlobal(
      'Event',
      typeof existingEvent === 'function' ? existingEvent : win.Event
    );
    defineGlobal(
      'CustomEvent',
      typeof existingCustomEvent === 'function'
        ? existingCustomEvent
        : win.CustomEvent
    );
    if (typeof existingDispatchEvent === 'function') {
      globalThis.dispatchEvent = existingDispatchEvent;
    } else if (typeof win.dispatchEvent === 'function') {
      globalThis.dispatchEvent = win.dispatchEvent.bind(
        win
      ) as typeof globalThis.dispatchEvent;
    }
  } else {
    if (typeof win.Event === 'function') defineGlobal('Event', win.Event);
    if (typeof win.CustomEvent === 'function')
      defineGlobal('CustomEvent', win.CustomEvent);
    if (typeof win.dispatchEvent === 'function') {
      globalThis.dispatchEvent = win.dispatchEvent.bind(
        win
      ) as typeof globalThis.dispatchEvent;
    }
  }
};

export const setupHappyDomEnvironment = async (
  options: SetupDomEnvironmentOptions
) => {
  registerScopeHooks();

  const domGlobal = globalThis as DomGlobalState;
  const needsInstall =
    !globalThis.window ||
    !globalThis.document ||
    domGlobal[DOM_ADAPTER_KEY] !== 'happy-dom';

  if (needsInstall) {
    const happyWindow = new GlobalWindow({
      url: options.runtimeOptions.domUrl,
    });
    installWindowGlobals(happyWindow as unknown as Record<string, any>);
    domGlobal[DOM_ADAPTER_KEY] = 'happy-dom';
  }

  applyReactActEnvironment(Boolean(options.enableReactActEnvironment));
};

export const setupJsdomEnvironment = async (
  options: SetupDomEnvironmentOptions
) => {
  registerScopeHooks();

  const domGlobal = globalThis as DomGlobalState;
  const needsInstall =
    !globalThis.window ||
    !globalThis.document ||
    domGlobal[DOM_ADAPTER_KEY] !== 'jsdom';

  if (needsInstall) {
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

    const jsdomWin = dom.window as unknown as Record<string, any>;
    jsdomWin.scrollTo = () => {};
    jsdomWin.scrollBy = () => {};

    installWindowGlobals(jsdomWin);
    domGlobal[DOM_ADAPTER_KEY] = 'jsdom';
  }

  applyReactActEnvironment(Boolean(options.enableReactActEnvironment));
};
