/**
 * ESM Support Module
 *
 * Exports all ESM-related functionality for the Kona bundler.
 */

// ESM Runtime
export {
  generateESMRuntime,
  wrapESMModule,
  hasTopLevelAwait,
  ESM_RUNTIME_NAMES,
  type IESMRuntimeConfig,
  type ICodeSplittingMap,
} from '../bundleRuntime/esmRuntime';

// Extension utilities
export {
  JS_EXTENSIONS,
  TS_EXTENSIONS,
  ESM_EXTENSIONS,
  CJS_EXTENSIONS,
  TS_ESM_EXTENSIONS,
  TS_CJS_EXTENSIONS,
  EXECUTABLE_EXTENSIONS,
  isESMExtension,
  isCJSExtension,
} from '../config/extensions';

// File lookup utilities
export {
  isESMFile,
  isCJSFile,
  fileLookup,
  type ILookupProps,
  type ILookupResult,
} from '../resolver/fileLookup';

// Import types
export {
  ImportType,
  isESMImport,
  isDynamicImport,
} from '../compiler/interfaces/ImportType';

// Bundle size optimization
export {
  analyzeModule,
  findDuplicateModules,
  optimizeBundle,
  optimizeImports,
  shouldPreserveModule,
  type BundleSizeReport,
  type OptimizationConfig,
  type ModuleAnalysis,
} from '../optimization/bundleSizeOptimizer';
