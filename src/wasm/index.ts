/**
 * WASM Module Integration for Kona Bundler
 *
 * This module provides TypeScript bindings for the Rust-powered
 * tree-shaking and minification functionality.
 */

import * as path from 'path';
import * as fs from 'fs';

// Types for WASM module
export interface WasmModule {
  version(): string;
  health_check(): boolean;
  TreeShaker: new (config?: TreeShakeConfigWasm) => TreeShakerWasm;
  Minifier: new (config?: MinifyConfigWasm) => MinifierWasm;
  TreeShakeConfig: new () => TreeShakeConfigWasm;
  MinifyConfig: new () => MinifyConfigWasm;
}

export interface TreeShakeConfigWasm {
  new (): TreeShakeConfigWasm;
  set_preserve_side_effects(value: boolean): void;
  set_analyze_dynamic_imports(value: boolean): void;
  add_preserve_module(module: string): void;
}

export interface MinifyConfigWasm {
  new (): MinifyConfigWasm;
  set_compress(value: boolean): void;
  set_mangle(value: boolean): void;
  set_source_map(value: boolean): void;
  set_keep_fn_names(value: boolean): void;
  set_keep_class_names(value: boolean): void;
  set_target(value: string): void;
  set_drop_console(value: boolean): void;
  set_drop_debugger(value: boolean): void;
  set_passes(value: number): void;
}

export interface TreeShakerWasm {
  new (config?: TreeShakeConfigWasm): TreeShakerWasm;
  analyze_module(code: string, module_id: string): ModuleAnalysis;
  shake_module(code: string, used_exports: Set<string>, generate_source_map: boolean): TreeShakeResult;
  shake_modules(modules: ModuleInput[]): TreeShakeResult[];
}

export interface MinifierWasm {
  new (config?: MinifyConfigWasm): MinifierWasm;
  minify(code: string, filename?: string): MinifyResult;
  minify_batch(files: FileInput[]): MinifyResult[];
  quick_minify(code: string): string;
}

// TypeScript interfaces for results
export interface ModuleAnalysis {
  module_id: string;
  exports: string[];
  imports: ImportInfo[];
  has_side_effects: boolean;
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  is_dynamic: boolean;
}

export interface TreeShakeResult {
  code: string;
  source_map: string | null;
  removed_exports: string[];
  removed_imports: string[];
  stats: TreeShakeStats;
}

export interface TreeShakeStats {
  original_size: number;
  final_size: number;
  exports_removed: number;
  imports_removed: number;
  dead_blocks_removed: number;
}

export interface ModuleInput {
  id: string;
  code: string;
  used_exports: string[];
}

export interface MinifyResult {
  code: string;
  source_map: string | null;
  stats: MinifyStats;
  warnings: string[];
}

export interface MinifyStats {
  original_size: number;
  minified_size: number;
  compression_ratio: number;
  time_ms: number;
}

export interface FileInput {
  filename: string;
  code: string;
}

// Configuration interfaces
export interface TreeShakeConfig {
  preserveSideEffects?: boolean;
  preserveModules?: string[];
  analyzeDynamicImports?: boolean;
}

export interface MinifyConfig {
  compress?: boolean;
  mangle?: boolean;
  sourceMap?: boolean;
  keepFnNames?: boolean;
  keepClassNames?: boolean;
  target?: string;
  dropConsole?: boolean;
  dropDebugger?: boolean;
  passes?: number;
}

// Singleton WASM module instance
let wasmModule: WasmModule | null = null;
let wasmLoadPromise: Promise<WasmModule> | null = null;

/**
 * Load the WASM module
 */
export async function loadWasmModule(): Promise<WasmModule> {
  if (wasmModule) {
    return wasmModule;
  }

  if (wasmLoadPromise) {
    return wasmLoadPromise;
  }

  wasmLoadPromise = (async () => {
    // Use require.resolve for CommonJS compatibility
    let wasmPath: string;
    try {
      wasmPath = require.resolve('../../rust-wasm/pkg/kona_wasm.js');
    } catch {
      wasmPath = path.resolve(process.cwd(), 'rust-wasm/pkg/kona_wasm.js');
    }

    if (!fs.existsSync(wasmPath)) {
      throw new Error(
        `WASM module not found at ${wasmPath}. ` +
          'Please run "npm run build:wasm" to compile the Rust module.'
      );
    }

    // Dynamic import of the WASM module
    const wasm = await import(wasmPath);
    await wasm.default();

    wasmModule = wasm as WasmModule;
    return wasmModule;
  })();

  return wasmLoadPromise;
}

/**
 * Check if WASM module is available
 */
export function isWasmAvailable(): boolean {
  try {
    require.resolve('../../rust-wasm/pkg/kona_wasm.js');
    return true;
  } catch {
    const wasmPath = path.resolve(process.cwd(), 'rust-wasm/pkg/kona_wasm.js');
    return fs.existsSync(wasmPath);
  }
}

/**
 * Get WASM module version
 */
export async function getWasmVersion(): Promise<string> {
  const wasm = await loadWasmModule();
  return wasm.version();
}

/**
 * High-level TreeShaker class with TypeScript-friendly API
 */
export class TreeShaker {
  private config: TreeShakeConfig;
  private wasmShaker: TreeShakerWasm | null = null;

  constructor(config: TreeShakeConfig = {}) {
    this.config = {
      preserveSideEffects: true,
      preserveModules: [],
      analyzeDynamicImports: true,
      ...config,
    };
  }

  private async getShaker(): Promise<TreeShakerWasm> {
    if (this.wasmShaker) {
      return this.wasmShaker;
    }

    const wasm = await loadWasmModule();
    const wasmConfig = new wasm.TreeShakeConfig();

    wasmConfig.set_preserve_side_effects(this.config.preserveSideEffects ?? true);
    wasmConfig.set_analyze_dynamic_imports(this.config.analyzeDynamicImports ?? true);

    for (const module of this.config.preserveModules ?? []) {
      wasmConfig.add_preserve_module(module);
    }

    this.wasmShaker = new wasm.TreeShaker(wasmConfig);
    return this.wasmShaker;
  }

  /**
   * Analyze a module to extract export/import information
   */
  async analyzeModule(code: string, moduleId: string): Promise<ModuleAnalysis> {
    const shaker = await this.getShaker();
    return shaker.analyze_module(code, moduleId);
  }

  /**
   * Perform tree-shaking on a module
   */
  async shakeModule(
    code: string,
    usedExports: Set<string> | string[],
    generateSourceMap = false
  ): Promise<TreeShakeResult> {
    const shaker = await this.getShaker();
    const exports = usedExports instanceof Set ? usedExports : new Set(usedExports);
    return shaker.shake_module(code, exports, generateSourceMap);
  }

  /**
   * Batch tree-shake multiple modules
   */
  async shakeModules(modules: ModuleInput[]): Promise<TreeShakeResult[]> {
    const shaker = await this.getShaker();
    return shaker.shake_modules(modules);
  }
}

/**
 * High-level Minifier class with TypeScript-friendly API
 */
export class Minifier {
  private config: MinifyConfig;
  private wasmMinifier: MinifierWasm | null = null;

  constructor(config: MinifyConfig = {}) {
    this.config = {
      compress: true,
      mangle: true,
      sourceMap: false,
      keepFnNames: false,
      keepClassNames: false,
      target: 'es2020',
      dropConsole: false,
      dropDebugger: true,
      passes: 2,
      ...config,
    };
  }

  private async getMinifier(): Promise<MinifierWasm> {
    if (this.wasmMinifier) {
      return this.wasmMinifier;
    }

    const wasm = await loadWasmModule();
    const wasmConfig = new wasm.MinifyConfig();

    wasmConfig.set_compress(this.config.compress ?? true);
    wasmConfig.set_mangle(this.config.mangle ?? true);
    wasmConfig.set_source_map(this.config.sourceMap ?? false);
    wasmConfig.set_keep_fn_names(this.config.keepFnNames ?? false);
    wasmConfig.set_keep_class_names(this.config.keepClassNames ?? false);
    wasmConfig.set_target(this.config.target ?? 'es2020');
    wasmConfig.set_drop_console(this.config.dropConsole ?? false);
    wasmConfig.set_drop_debugger(this.config.dropDebugger ?? true);
    wasmConfig.set_passes(this.config.passes ?? 2);

    this.wasmMinifier = new wasm.Minifier(wasmConfig);
    return this.wasmMinifier;
  }

  /**
   * Minify JavaScript code
   */
  async minify(code: string, filename?: string): Promise<MinifyResult> {
    const minifier = await this.getMinifier();
    return minifier.minify(code, filename);
  }

  /**
   * Minify multiple files in batch
   */
  async minifyBatch(files: FileInput[]): Promise<MinifyResult[]> {
    const minifier = await this.getMinifier();
    return minifier.minify_batch(files);
  }

  /**
   * Quick minification (faster but less optimal)
   */
  async quickMinify(code: string): Promise<string> {
    const minifier = await this.getMinifier();
    return minifier.quick_minify(code);
  }
}

/**
 * Convenience function to minify code with default settings
 */
export async function minifyCode(code: string, config?: MinifyConfig): Promise<MinifyResult> {
  const minifier = new Minifier(config);
  return minifier.minify(code);
}

/**
 * Convenience function to tree-shake code with default settings
 */
export async function treeShakeCode(
  code: string,
  usedExports: string[],
  config?: TreeShakeConfig
): Promise<TreeShakeResult> {
  const shaker = new TreeShaker(config);
  return shaker.shakeModule(code, usedExports);
}
