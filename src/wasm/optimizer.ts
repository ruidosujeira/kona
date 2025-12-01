/**
 * Kona Optimizer - High-performance optimization using Rust WASM
 *
 * This module provides a unified interface for tree-shaking and minification,
 * automatically falling back to JavaScript implementations when WASM is unavailable.
 */

import { isWasmAvailable as checkWasmAvailable, TreeShaker, Minifier, MinifyConfig, TreeShakeConfig } from './index';
import { TreeShakerFallback, MinifierFallback } from './fallback';
import type { MinifyResult, TreeShakeResult, ModuleAnalysis, ModuleInput, FileInput } from './index';

// Re-export isWasmAvailable
export const isWasmAvailable = checkWasmAvailable;

export interface OptimizerConfig {
  /** Force use of JavaScript fallback even if WASM is available */
  forceJsFallback?: boolean;
  /** Tree-shaking configuration */
  treeShake?: TreeShakeConfig;
  /** Minification configuration */
  minify?: MinifyConfig;
}

/**
 * Unified optimizer that uses WASM when available, falls back to JS otherwise
 */
export class Optimizer {
  private config: OptimizerConfig;
  private useWasm: boolean;
  private treeShaker: TreeShaker | TreeShakerFallback | null = null;
  private minifier: Minifier | MinifierFallback | null = null;

  constructor(config: OptimizerConfig = {}) {
    this.config = config;
    this.useWasm = !config.forceJsFallback && isWasmAvailable();
  }

  /**
   * Check if WASM is being used
   */
  isUsingWasm(): boolean {
    return this.useWasm;
  }

  /**
   * Get or create tree shaker instance
   */
  private getTreeShaker(): TreeShaker | TreeShakerFallback {
    if (!this.treeShaker) {
      this.treeShaker = this.useWasm
        ? new TreeShaker(this.config.treeShake)
        : new TreeShakerFallback(this.config.treeShake);
    }
    return this.treeShaker;
  }

  /**
   * Get or create minifier instance
   */
  private getMinifier(): Minifier | MinifierFallback {
    if (!this.minifier) {
      this.minifier = this.useWasm
        ? new Minifier(this.config.minify)
        : new MinifierFallback(this.config.minify);
    }
    return this.minifier;
  }

  /**
   * Analyze a module to extract export/import information
   */
  async analyzeModule(code: string, moduleId: string): Promise<ModuleAnalysis> {
    const shaker = this.getTreeShaker();
    if (shaker instanceof TreeShaker) {
      return shaker.analyzeModule(code, moduleId);
    }
    return shaker.analyzeModule(code, moduleId);
  }

  /**
   * Perform tree-shaking on a module
   */
  async treeShake(
    code: string,
    usedExports: Set<string> | string[],
    generateSourceMap = false
  ): Promise<TreeShakeResult> {
    const shaker = this.getTreeShaker();
    if (shaker instanceof TreeShaker) {
      return shaker.shakeModule(code, usedExports, generateSourceMap);
    }
    return shaker.shakeModule(code, usedExports, generateSourceMap);
  }

  /**
   * Batch tree-shake multiple modules
   */
  async treeShakeModules(modules: ModuleInput[]): Promise<TreeShakeResult[]> {
    const shaker = this.getTreeShaker();
    if (shaker instanceof TreeShaker) {
      return shaker.shakeModules(modules);
    }
    return shaker.shakeModules(modules);
  }

  /**
   * Minify JavaScript code
   */
  async minify(code: string, filename?: string): Promise<MinifyResult> {
    const minifier = this.getMinifier();
    return minifier.minify(code, filename);
  }

  /**
   * Minify multiple files in batch
   */
  async minifyBatch(files: FileInput[]): Promise<MinifyResult[]> {
    const minifier = this.getMinifier();
    return minifier.minifyBatch(files);
  }

  /**
   * Quick minification (faster but less optimal)
   */
  async quickMinify(code: string): Promise<string> {
    const minifier = this.getMinifier();
    if (minifier instanceof Minifier) {
      return minifier.quickMinify(code);
    }
    return minifier.quickMinify(code);
  }

  /**
   * Full optimization pipeline: tree-shake then minify
   */
  async optimize(
    code: string,
    usedExports: string[],
    options: { filename?: string; generateSourceMap?: boolean } = {}
  ): Promise<{
    code: string;
    sourceMap: string | null;
    treeShakeStats: TreeShakeResult['stats'];
    minifyStats: MinifyResult['stats'];
  }> {
    // Step 1: Tree-shake
    const treeShakeResult = await this.treeShake(
      code,
      usedExports,
      options.generateSourceMap
    );

    // Step 2: Minify the tree-shaken code
    const minifyResult = await this.minify(
      treeShakeResult.code,
      options.filename
    );

    return {
      code: minifyResult.code,
      sourceMap: minifyResult.source_map,
      treeShakeStats: treeShakeResult.stats,
      minifyStats: minifyResult.stats,
    };
  }
}

// Singleton instance for convenience
let defaultOptimizer: Optimizer | null = null;

/**
 * Get the default optimizer instance
 */
export function getOptimizer(config?: OptimizerConfig): Optimizer {
  if (!defaultOptimizer || config) {
    defaultOptimizer = new Optimizer(config);
  }
  return defaultOptimizer;
}

/**
 * Convenience function to minify code
 */
export async function minifyCode(
  code: string,
  config?: MinifyConfig
): Promise<MinifyResult> {
  const optimizer = getOptimizer({ minify: config });
  return optimizer.minify(code);
}

/**
 * Convenience function to tree-shake code
 */
export async function treeShakeCode(
  code: string,
  usedExports: string[],
  config?: TreeShakeConfig
): Promise<TreeShakeResult> {
  const optimizer = getOptimizer({ treeShake: config });
  return optimizer.treeShake(code, usedExports);
}

/**
 * Convenience function for full optimization
 */
export async function optimizeCode(
  code: string,
  usedExports: string[],
  config?: OptimizerConfig
): Promise<{
  code: string;
  sourceMap: string | null;
  treeShakeStats: TreeShakeResult['stats'];
  minifyStats: MinifyResult['stats'];
}> {
  const optimizer = getOptimizer(config);
  return optimizer.optimize(code, usedExports);
}
