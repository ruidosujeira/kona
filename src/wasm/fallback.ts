/**
 * JavaScript Fallback for WASM Module
 *
 * Provides fallback implementations when WASM module is not available.
 * Uses Terser for minification (existing dependency).
 */

import * as Terser from 'terser';
import type {
  MinifyConfig,
  MinifyResult,
  TreeShakeConfig,
  TreeShakeResult,
  ModuleAnalysis,
  ImportInfo,
  ModuleInput,
  FileInput,
} from './index';

/**
 * Fallback TreeShaker using regex-based analysis
 */
export class TreeShakerFallback {
  private config: TreeShakeConfig;

  constructor(config: TreeShakeConfig = {}) {
    this.config = {
      preserveSideEffects: true,
      preserveModules: [],
      analyzeDynamicImports: true,
      ...config,
    };
  }

  /**
   * Analyze a module to extract export/import information
   */
  analyzeModule(code: string, moduleId: string): ModuleAnalysis {
    const exports: string[] = [];
    const imports: ImportInfo[] = [];
    let hasSideEffects = false;

    // Find exports
    const exportRegex = /export\s+(?:const|let|var|function|class|default)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(code)) !== null) {
      exports.push(match[1]);
    }

    // Find named exports
    const namedExportRegex = /export\s*\{\s*([^}]+)\s*\}/g;
    while ((match = namedExportRegex.exec(code)) !== null) {
      const names = match[1].split(',');
      for (const name of names) {
        const trimmed = name.trim().split(/\s+as\s+/)[0].trim();
        if (trimmed) {
          exports.push(trimmed);
        }
      }
    }

    // Find imports
    const importRegex = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = importRegex.exec(code)) !== null) {
      const source = match[3];
      const specifiers: string[] = [];

      if (match[1]) {
        for (const spec of match[1].split(',')) {
          const trimmed = spec.trim().split(/\s+as\s+/)[0].trim();
          if (trimmed) {
            specifiers.push(trimmed);
          }
        }
      }
      if (match[2]) {
        specifiers.push(match[2]);
      }

      imports.push({
        source,
        specifiers,
        is_dynamic: false,
      });
    }

    // Find dynamic imports
    if (this.config.analyzeDynamicImports) {
      const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = dynamicImportRegex.exec(code)) !== null) {
        imports.push({
          source: match[1],
          specifiers: ['*'],
          is_dynamic: true,
        });
      }
    }

    // Check for side effects
    if (this.config.preserveSideEffects) {
      const sideEffectPatterns = [
        /^\s*\w+\s*\(/m,
        /window\./,
        /document\./,
        /globalThis\./,
        /^\s*if\s*\(/m,
      ];

      for (const pattern of sideEffectPatterns) {
        if (pattern.test(code)) {
          hasSideEffects = true;
          break;
        }
      }
    }

    return {
      module_id: moduleId,
      exports,
      imports,
      has_side_effects: hasSideEffects,
    };
  }

  /**
   * Perform tree-shaking on a module
   */
  shakeModule(
    code: string,
    usedExports: Set<string> | string[],
    _generateSourceMap = false
  ): TreeShakeResult {
    const originalSize = code.length;
    let resultCode = code;
    const removedExports: string[] = [];
    const removedImports: string[] = [];
    let deadBlocksRemoved = 0;

    const exports = usedExports instanceof Set ? usedExports : new Set(usedExports);

    // Remove unused exports
    const exportRegex = /export\s+(?:const|let|var)\s+(\w+)\s*=\s*[^;]+;/g;
    resultCode = resultCode.replace(exportRegex, (match, name) => {
      if (!exports.has(name) && !exports.has('*')) {
        removedExports.push(name);
        deadBlocksRemoved++;
        return '';
      }
      return match;
    });

    // Remove unused function exports
    const fnExportRegex = /export\s+function\s+(\w+)\s*\([^)]*\)\s*\{[^}]*\}/g;
    resultCode = resultCode.replace(fnExportRegex, (match, name) => {
      if (!exports.has(name) && !exports.has('*')) {
        removedExports.push(name);
        deadBlocksRemoved++;
        return '';
      }
      return match;
    });

    // Clean up empty lines
    resultCode = resultCode.replace(/\n\s*\n\s*\n/g, '\n\n');

    const finalSize = resultCode.length;

    return {
      code: resultCode,
      source_map: null,
      removed_exports: removedExports,
      removed_imports: removedImports,
      stats: {
        original_size: originalSize,
        final_size: finalSize,
        exports_removed: removedExports.length,
        imports_removed: removedImports.length,
        dead_blocks_removed: deadBlocksRemoved,
      },
    };
  }

  /**
   * Batch tree-shake multiple modules
   */
  shakeModules(modules: ModuleInput[]): TreeShakeResult[] {
    return modules.map((m) => this.shakeModule(m.code, new Set(m.used_exports)));
  }
}

/**
 * Fallback Minifier using Terser
 */
export class MinifierFallback {
  private config: MinifyConfig;

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

  /**
   * Minify JavaScript code using Terser
   */
  async minify(code: string, filename?: string): Promise<MinifyResult> {
    const start = Date.now();
    const originalSize = code.length;
    const warnings: string[] = [];

    try {
      const terserOptions: Terser.MinifyOptions = {
        compress: this.config.compress
          ? {
              drop_console: this.config.dropConsole,
              drop_debugger: this.config.dropDebugger,
              passes: this.config.passes,
            }
          : false,
        mangle: this.config.mangle
          ? {
              keep_fnames: this.config.keepFnNames,
              keep_classnames: this.config.keepClassNames,
            }
          : false,
        sourceMap: this.config.sourceMap
          ? {
              includeSources: true,
            }
          : false,
      };

      const result = await Terser.minify(code, terserOptions);
      const minifiedCode = result.code || code;
      const minifiedSize = minifiedCode.length;

      return {
        code: minifiedCode,
        source_map: result.map ? result.map.toString() : null,
        stats: {
          original_size: originalSize,
          minified_size: minifiedSize,
          compression_ratio: originalSize > 0 ? minifiedSize / originalSize : 1,
          time_ms: Date.now() - start,
        },
        warnings,
      };
    } catch (error) {
      warnings.push(`Minification error: ${error}`);
      return {
        code,
        source_map: null,
        stats: {
          original_size: originalSize,
          minified_size: originalSize,
          compression_ratio: 1,
          time_ms: Date.now() - start,
        },
        warnings,
      };
    }
  }

  /**
   * Minify multiple files in batch
   */
  async minifyBatch(files: FileInput[]): Promise<MinifyResult[]> {
    return Promise.all(files.map((f) => this.minify(f.code, f.filename)));
  }

  /**
   * Quick minification using regex (faster but less optimal)
   */
  quickMinify(code: string): string {
    let result = code;

    // Remove single-line comments (but not URLs)
    result = result.replace(/(?<!:)\/\/(?![:/]).*$/gm, '');

    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove unnecessary whitespace
    result = result.replace(/\s+/g, ' ');

    // Remove spaces around operators
    result = result.replace(/\s*([=+\-*/<>!&|,;:{}()\[\]])\s*/g, '$1');

    // Remove trailing semicolons before closing braces
    result = result.replace(/;\s*}/g, '}');

    return result.trim();
  }
}
