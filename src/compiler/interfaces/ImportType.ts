export enum ImportType {
  /** CommonJS require() */
  REQUIRE = 1,
  /** ESM import ... from '...' */
  FROM = 2,
  /** ESM import '...' (side-effect only) */
  RAW_IMPORT = 3,
  /** Dynamic import() */
  DYNAMIC = 4,
  /** ESM import * as namespace from '...' */
  NAMESPACE = 5,
  /** ESM export ... from '...' (re-export) */
  EXPORT_FROM = 6,
  /** ESM export * from '...' (re-export all) */
  EXPORT_ALL = 7,
}

/**
 * Check if import type is ESM
 */
export function isESMImport(type: ImportType): boolean {
  return type === ImportType.FROM ||
         type === ImportType.RAW_IMPORT ||
         type === ImportType.NAMESPACE ||
         type === ImportType.EXPORT_FROM ||
         type === ImportType.EXPORT_ALL;
}

/**
 * Check if import type is dynamic
 */
export function isDynamicImport(type: ImportType): boolean {
  return type === ImportType.DYNAMIC;
}
