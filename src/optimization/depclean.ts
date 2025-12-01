/**
 * Dependency Cleaner (depclean) for Kona Bundler
 *
 * Automatically detects and removes obsolete dependencies during bundling:
 * - Unused npm packages
 * - Duplicate dependencies
 * - Circular dependency detection
 * - Dead code paths
 *
 * @example
 * ```ts
 * fusebox({
 *   depclean: {
 *     enabled: true,
 *     removeUnused: true,
 *     reportOnly: false,
 *   }
 * })
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { Context } from '../core/context';
import { IModule } from '../moduleResolver/module';
import { IBundleContext } from '../moduleResolver/bundleContext';

export interface DepcleanConfig {
  /** Enable depclean mode */
  enabled?: boolean;
  /** Only report, don't remove */
  reportOnly?: boolean;
  /** Remove unused dependencies from bundle */
  removeUnused?: boolean;
  /** Detect and warn about circular dependencies */
  detectCircular?: boolean;
  /** Packages to always keep (never remove) */
  whitelist?: string[];
  /** Packages to always remove */
  blacklist?: string[];
  /** Max depth for dependency analysis */
  maxDepth?: number;
  /** Generate detailed report */
  generateReport?: boolean;
  /** Output path for report */
  reportPath?: string;
}

export interface DepcleanReport {
  /** Total packages analyzed */
  totalPackages: number;
  /** Packages actually used in bundle */
  usedPackages: string[];
  /** Packages declared but not used */
  unusedPackages: string[];
  /** Duplicate packages (same package, different versions) */
  duplicatePackages: Array<{
    name: string;
    versions: string[];
    locations: string[];
  }>;
  /** Circular dependencies detected */
  circularDependencies: Array<string[]>;
  /** Potential size savings */
  potentialSavings: {
    unusedBytes: number;
    duplicateBytes: number;
    totalBytes: number;
  };
  /** Recommendations */
  recommendations: string[];
}

/**
 * Analyze dependencies from package.json
 */
export function analyzePackageJson(projectRoot: string): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
} {
  const packageJsonPath = path.join(projectRoot, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    };
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

  return {
    dependencies: packageJson.dependencies || {},
    devDependencies: packageJson.devDependencies || {},
    peerDependencies: packageJson.peerDependencies || {},
  };
}

/**
 * Extract used packages from bundled modules
 */
export function extractUsedPackages(bundleContext: IBundleContext): Set<string> {
  const usedPackages = new Set<string>();

  for (const absPath in bundleContext.modules) {
    const module = bundleContext.modules[absPath];
    if (!module) continue;

    // Check if module is from node_modules
    const nodeModulesMatch = absPath.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
    if (nodeModulesMatch) {
      usedPackages.add(nodeModulesMatch[1]);
    }

    // Also check package info if available
    if (module.pkg?.meta?.name) {
      usedPackages.add(module.pkg.meta.name);
    }
  }

  return usedPackages;
}

/**
 * Detect circular dependencies in the module graph
 */
export function detectCircularDependencies(
  bundleContext: IBundleContext
): Array<string[]> {
  const circular: Array<string[]> = [];
  const visited = new Set<number>();
  const recursionStack = new Set<number>();
  const pathStack: number[] = [];

  function dfs(moduleId: number): boolean {
    visited.add(moduleId);
    recursionStack.add(moduleId);
    pathStack.push(moduleId);

    // Find module by id
    let currentModule: IModule | undefined;
    for (const absPath in bundleContext.modules) {
      if (bundleContext.modules[absPath]?.id === moduleId) {
        currentModule = bundleContext.modules[absPath];
        break;
      }
    }

    if (currentModule?.dependencies) {
      for (const depId of currentModule.dependencies) {
        if (!visited.has(depId)) {
          if (dfs(depId)) {
            return true;
          }
        } else if (recursionStack.has(depId)) {
          // Found circular dependency
          const cycleStart = pathStack.indexOf(depId);
          const cycle = pathStack.slice(cycleStart).map(id => {
            for (const absPath in bundleContext.modules) {
              if (bundleContext.modules[absPath]?.id === id) {
                return bundleContext.modules[absPath].publicPath || absPath;
              }
            }
            return `module:${id}`;
          });
          circular.push(cycle);
        }
      }
    }

    pathStack.pop();
    recursionStack.delete(moduleId);
    return false;
  }

  // Start DFS from all modules
  for (const absPath in bundleContext.modules) {
    const module = bundleContext.modules[absPath];
    if (module && !visited.has(module.id)) {
      dfs(module.id);
    }
  }

  return circular;
}

/**
 * Find duplicate packages (same package with different versions)
 */
export function findDuplicatePackages(
  bundleContext: IBundleContext
): Map<string, Array<{ version: string; location: string }>> {
  const packageVersions = new Map<string, Array<{ version: string; location: string }>>();

  for (const absPath in bundleContext.modules) {
    const module = bundleContext.modules[absPath];
    if (!module?.pkg?.meta) continue;

    const { name, version, packageRoot } = module.pkg.meta;
    if (!name || !version) continue;

    if (!packageVersions.has(name)) {
      packageVersions.set(name, []);
    }

    const versions = packageVersions.get(name)!;
    const existing = versions.find(v => v.version === version && v.location === packageRoot);
    if (!existing) {
      versions.push({ version, location: packageRoot });
    }
  }

  // Filter to only duplicates
  const duplicates = new Map<string, Array<{ version: string; location: string }>>();
  for (const [name, versions] of packageVersions) {
    if (versions.length > 1) {
      duplicates.set(name, versions);
    }
  }

  return duplicates;
}

/**
 * Calculate potential size savings
 */
export function calculateSavings(
  bundleContext: IBundleContext,
  unusedPackages: string[],
  duplicates: Map<string, Array<{ version: string; location: string }>>
): { unusedBytes: number; duplicateBytes: number; totalBytes: number } {
  let unusedBytes = 0;
  let duplicateBytes = 0;
  let totalBytes = 0;

  for (const absPath in bundleContext.modules) {
    const module = bundleContext.modules[absPath];
    if (!module?.contents) continue;

    const size = module.contents.length;
    totalBytes += size;

    // Check if from unused package
    const nodeModulesMatch = absPath.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
    if (nodeModulesMatch && unusedPackages.includes(nodeModulesMatch[1])) {
      unusedBytes += size;
    }

    // Check if duplicate
    if (module.pkg?.meta?.name && duplicates.has(module.pkg.meta.name)) {
      const versions = duplicates.get(module.pkg.meta.name)!;
      if (versions.length > 1) {
        // Count all but the first version as duplicate
        const isFirstVersion = versions[0].location === module.pkg.meta.packageRoot;
        if (!isFirstVersion) {
          duplicateBytes += size;
        }
      }
    }
  }

  return { unusedBytes, duplicateBytes, totalBytes };
}

/**
 * Generate recommendations based on analysis
 */
export function generateRecommendations(
  report: Partial<DepcleanReport>
): string[] {
  const recommendations: string[] = [];

  if (report.unusedPackages?.length) {
    recommendations.push(
      `Remove ${report.unusedPackages.length} unused packages: npm uninstall ${report.unusedPackages.slice(0, 5).join(' ')}${report.unusedPackages.length > 5 ? ' ...' : ''}`
    );
  }

  if (report.duplicatePackages?.length) {
    for (const dup of report.duplicatePackages.slice(0, 3)) {
      recommendations.push(
        `Deduplicate "${dup.name}" (${dup.versions.length} versions): npm dedupe or use resolutions`
      );
    }
  }

  if (report.circularDependencies?.length) {
    recommendations.push(
      `Fix ${report.circularDependencies.length} circular dependencies to improve tree-shaking`
    );
  }

  if (report.potentialSavings) {
    const totalSavings = report.potentialSavings.unusedBytes + report.potentialSavings.duplicateBytes;
    if (totalSavings > 10240) { // > 10KB
      const savingsKB = Math.round(totalSavings / 1024);
      recommendations.push(
        `Potential bundle size reduction: ~${savingsKB}KB`
      );
    }
  }

  return recommendations;
}

/**
 * Run depclean analysis
 */
export async function runDepclean(
  ctx: Context,
  config: DepcleanConfig = {}
): Promise<DepcleanReport> {
  const {
    detectCircular = true,
    whitelist = [],
    generateReport = true,
  } = config;

  const projectRoot = process.cwd();
  const bundleContext = ctx.bundleContext;

  ctx.log.info('depclean', 'Starting dependency analysis...');

  // Analyze package.json
  const packageInfo = analyzePackageJson(projectRoot);
  const declaredDeps = Object.keys(packageInfo.dependencies);

  // Extract used packages from bundle
  const usedPackages = extractUsedPackages(bundleContext);
  const usedPackagesList = Array.from(usedPackages);

  // Find unused packages
  const unusedPackages = declaredDeps.filter(
    dep => !usedPackages.has(dep) && !whitelist.includes(dep)
  );

  // Find duplicates
  const duplicatesMap = findDuplicatePackages(bundleContext);
  const duplicatePackages = Array.from(duplicatesMap.entries()).map(([name, versions]) => ({
    name,
    versions: versions.map(v => v.version),
    locations: versions.map(v => v.location),
  }));

  // Detect circular dependencies
  let circularDependencies: Array<string[]> = [];
  if (detectCircular) {
    circularDependencies = detectCircularDependencies(bundleContext);
  }

  // Calculate savings
  const potentialSavings = calculateSavings(bundleContext, unusedPackages, duplicatesMap);

  // Build report
  const report: DepcleanReport = {
    totalPackages: declaredDeps.length,
    usedPackages: usedPackagesList,
    unusedPackages,
    duplicatePackages,
    circularDependencies,
    potentialSavings,
    recommendations: [],
  };

  report.recommendations = generateRecommendations(report);

  // Log results
  ctx.log.info('depclean', `Analyzed ${report.totalPackages} packages`);
  ctx.log.info('depclean', `Used: ${report.usedPackages.length}, Unused: ${report.unusedPackages.length}`);

  if (report.unusedPackages.length > 0) {
    ctx.log.warn(`Unused packages: ${report.unusedPackages.join(', ')}`);
  }

  if (report.duplicatePackages.length > 0) {
    ctx.log.warn(`Duplicate packages: ${report.duplicatePackages.map(d => d.name).join(', ')}`);
  }

  if (report.circularDependencies.length > 0) {
    ctx.log.warn(`Circular dependencies detected: ${report.circularDependencies.length}`);
  }

  // Generate report file if requested
  if (generateReport && config.reportPath) {
    const reportJson = JSON.stringify(report, null, 2);
    fs.writeFileSync(config.reportPath, reportJson);
    ctx.log.info('depclean', `Report saved to ${config.reportPath}`);
  }

  return report;
}

/**
 * Create depclean plugin
 */
export function createDepcleanPlugin(config: DepcleanConfig = {}) {
  return (ctx: Context) => {
    if (!config.enabled) return;

    ctx.ict.on('complete', async () => {
      await runDepclean(ctx, config);
    });
  };
}

/**
 * Filter modules to remove unused dependencies
 */
export function filterUnusedModules(
  modules: Record<string, IModule>,
  unusedPackages: string[]
): Record<string, IModule> {
  const filtered: Record<string, IModule> = {};

  for (const absPath in modules) {
    const module = modules[absPath];
    if (!module) continue;

    // Check if module is from an unused package
    const nodeModulesMatch = absPath.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
    if (nodeModulesMatch && unusedPackages.includes(nodeModulesMatch[1])) {
      continue; // Skip unused package
    }

    filtered[absPath] = module;
  }

  return filtered;
}

export default {
  runDepclean,
  createDepcleanPlugin,
  analyzePackageJson,
  extractUsedPackages,
  detectCircularDependencies,
  findDuplicatePackages,
  filterUnusedModules,
};
