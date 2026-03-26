/**
 * Utility types originally from @foxglove/extension, inlined here to avoid
 * the workspace dependency.
 */

export type Immutable<T> = T extends ((...args: unknown[]) => unknown)
  ? T
  : T extends object
    ? { readonly [K in keyof T]: Immutable<T[K]> }
    : T;

export type VariableStruct = Record<string, string | number | boolean | undefined>;
