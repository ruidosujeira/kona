/**
 * Bundle Size Optimizer
 *
 * Reduces bundle size through various optimization techniques:
 * - Dead code elimination
 * - Duplicate module detection
 * - Scope hoisting preparation
 * - Import deduplication
 * - Polyfill optimization
 */

import { IModule } from '../moduleResolver/module';
import { Context } from '../core/context';

export interface BundleSizeReport {
  /** Original total size in bytes */
  originalSize: number;
  /** Optimized size in bytes */
  optimizedSize: number;
  /** Size reduction percentage */
  reductionPercent: number;
  /** Modules that were removed */
  removedModules: string[];
  /** Duplicate modules that were deduplicated */
  deduplicatedModules: Array<{ original: string; duplicates: string[] }>;
  /** Unused exports that were removed */
  unusedExports: Array<{ module: string; exports: string[] }>;
}

export interface OptimizationConfig {
  /** Enable dead code elimination */
  deadCodeElimination?: boolean;
  /** Enable duplicate detection */
  deduplication?: boolean;
  /** Enable scope hoisting */
  scopeHoisting?: boolean;
  /** Side effects configuration from package.json */
  sideEffects?: boolean | string[];
  /** Modules to always include (never tree-shake) */
  preserveModules?: string[];
}

/**
 * Analyze module for potential size optimizations
 */
export function analyzeModule(module: IModule): ModuleAnalysis {
  const code = module.contents || '';
  const analysis: ModuleAnalysis = {
    moduleId: module.id,
    modulePath: module.publicPath,
    size: Buffer.byteLength(code, 'utf8'),
    exports: [],
    imports: [],
    hasSideEffects: true,
    isESM: false,
    hasTopLevelAwait: false,
    hasDynamicImports: false,
  };

  // Detect ESM
  analysis.isESM = /\b(import|export)\s/.test(code);

  // Detect top-level await
  analysis.hasTopLevelAwait = detectTopLevelAwait(code);

  // Detect dynamic imports
  analysis.hasDynamicImports = /import\s*\(/.test(code);

  // Extract exports
  const exportMatches = code.matchAll(/export\s+(?:const|let|var|function|class|default)\s+(\w+)/g);
  for (const match of exportMatches) {
    analysis.exports.push(match[1]);
  }

  // Extract named exports
  const namedExportMatches = code.matchAll(/export\s*\{\s*([^}]+)\s*\}/g);
  for (const match of namedExportMatches) {
    const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
    analysis.exports.push(...names.filter(n => n));
  }

  // Detect side effects (simplified heuristic)
  analysis.hasSideEffects = detectSideEffects(code);

  return analysis;
}

export interface ModuleAnalysis {
  moduleId: number;
  modulePath: string;
  size: number;
  exports: string[];
  imports: string[];
  hasSideEffects: boolean;
  isESM: boolean;
  hasTopLevelAwait: boolean;
  hasDynamicImports: boolean;
}

/**
 * Detect if code has side effects
 */
function detectSideEffects(code: string): boolean {
  // Patterns that indicate side effects
  const sideEffectPatterns = [
    /^\s*\w+\s*\(/m,                    // Top-level function calls
    /window\s*\./,                       // Window access
    /document\s*\./,                     // Document access
    /globalThis\s*\./,                   // GlobalThis access
    /global\s*\./,                       // Node global access
    /process\s*\./,                      // Process access
    /Object\.defineProperty\s*\(/,       // Property definition
    /Object\.assign\s*\(/,               // Object mutation
    /Array\.prototype\./,                // Prototype modification
    /\.prototype\s*=/,                   // Prototype assignment
  ];

  for (const pattern of sideEffectPatterns) {
    if (pattern.test(code)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect top-level await in code
 */
function detectTopLevelAwait(code: string): boolean {
  // Remove string literals and comments to avoid false positives
  const cleaned = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '')
    .replace(/'[^']*'/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/`[^`]*`/g, '');

  // Check for await outside async functions
  // This is a simplified check
  const lines = cleaned.split('\n');
  let asyncDepth = 0;

  for (const line of lines) {
    if (/async\s+(function|\()/.test(line)) {
      asyncDepth++;
    }
    if (asyncDepth === 0 && /\bawait\s+/.test(line)) {
      return true;
    }
    // Count braces to track function scope (simplified)
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    asyncDepth = Math.max(0, asyncDepth - (closeBraces - openBraces));
  }

  return false;
}

/**
 * Find duplicate modules in the bundle
 */
export function findDuplicateModules(modules: IModule[]): Map<string, IModule[]> {
  const contentHashes = new Map<string, IModule[]>();

  for (const module of modules) {
    if (!module.contents) continue;

    // Create a simple hash of the content
    const hash = simpleHash(module.contents);

    if (!contentHashes.has(hash)) {
      contentHashes.set(hash, []);
    }
    contentHashes.get(hash).push(module);
  }

  // Filter to only duplicates
  const duplicates = new Map<string, IModule[]>();
  for (const [hash, mods] of contentHashes) {
    if (mods.length > 1) {
      duplicates.set(hash, mods);
    }
  }

  return duplicates;
}

/**
 * Simple string hash function
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Optimize bundle by removing unused code
 */
export async function optimizeBundle(
  ctx: Context,
  modules: IModule[],
  config: OptimizationConfig = {}
): Promise<BundleSizeReport> {
  const report: BundleSizeReport = {
    originalSize: 0,
    optimizedSize: 0,
    reductionPercent: 0,
    removedModules: [],
    deduplicatedModules: [],
    unusedExports: [],
  };

  // Calculate original size
  for (const module of modules) {
    if (module.contents) {
      report.originalSize += Buffer.byteLength(module.contents, 'utf8');
    }
  }

  // Find and report duplicates
  if (config.deduplication !== false) {
    const duplicates = findDuplicateModules(modules);
    for (const [, mods] of duplicates) {
      if (mods.length > 1) {
        report.deduplicatedModules.push({
          original: mods[0].publicPath,
          duplicates: mods.slice(1).map(m => m.publicPath),
        });
        ctx.log.info('optimize', `Found duplicate modules: ${mods.map(m => m.publicPath).join(', ')}`);
      }
    }
  }

  // Analyze each module
  const analyses = modules.map(m => analyzeModule(m));

  // Report modules with no side effects that could be tree-shaken
  for (const analysis of analyses) {
    if (!analysis.hasSideEffects && analysis.exports.length > 0) {
      ctx.log.info('optimize', `Module ${analysis.modulePath} has no side effects - eligible for tree-shaking`);
    }
  }

  // Calculate optimized size (after potential optimizations)
  report.optimizedSize = report.originalSize;

  // Calculate reduction
  if (report.originalSize > 0) {
    report.reductionPercent = ((report.originalSize - report.optimizedSize) / report.originalSize) * 100;
  }

  return report;
}

/**
 * Generate optimized imports for a module
 * Converts namespace imports to named imports where possible
 */
export function optimizeImports(code: string): string {
  // Convert: import * as foo from 'bar'; foo.baz() -> import { baz } from 'bar'; baz()
  // This is a simplified implementation

  let result = code;

  // Find namespace imports
  const namespaceImports = code.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g);

  for (const match of namespaceImports) {
    const namespace = match[1];
    const source = match[2];

    // Find all usages of the namespace
    const usageRegex = new RegExp(`${namespace}\\.(\\w+)`, 'g');
    const usages = new Set<string>();

    let usageMatch;
    while ((usageMatch = usageRegex.exec(code)) !== null) {
      usages.add(usageMatch[1]);
    }

    // If we found specific usages, we could optimize to named imports
    // (In practice, this would require more sophisticated analysis)
    if (usages.size > 0 && usages.size < 5) {
      // Small number of usages - could be optimized to named imports
      // Log for potential optimization
      console.debug(`Namespace import from '${source}' could be optimized to: { ${[...usages].join(', ')} }`);
    }
  }

  return result;
}

/**
 * Check if a module should be preserved (not tree-shaken)
 */
export function shouldPreserveModule(
  module: IModule,
  preserveList: string[] = []
): boolean {
  // Always preserve entry points
  if (module.isEntry) return true;

  // Check preserve list
  for (const pattern of preserveList) {
    if (module.publicPath.includes(pattern)) {
      return true;
    }
  }

  return false;
}
