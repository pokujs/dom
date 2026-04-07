declare module 'poku/plugins' {
  export const definePlugin: (plugin: any) => any;

  export type ScopeHookHolder = { scope: unknown };
  export type ScopeHookProvider = {
    name: string;
    createHolder: () => ScopeHookHolder;
    runScoped: (
      holder: ScopeHookHolder,
      fn: (params?: Record<string, unknown>) => Promise<unknown> | unknown
    ) => Promise<void>;
  };

  export const composeScopeHooks: (provider: ScopeHookProvider) => {
    createHolder: () => ScopeHookHolder;
    runScoped: (
      holder: ScopeHookHolder,
      fn: (params?: Record<string, unknown>) => Promise<unknown> | unknown
    ) => Promise<void>;
  };
}
