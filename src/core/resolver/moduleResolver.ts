/**
 * Kona Module Resolver
 * 
 * Resolves import specifiers to absolute file paths.
 * Supports:
 * - Relative imports (./foo, ../bar)
 * - Bare imports (react, lodash/get)
 * - Node.js resolution algorithm
 * - Package.json exports field
 * - TypeScript paths
 * - Browser field
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ResolveOptions {
  /** Base directory for resolution */
  basedir: string;
  /** File extensions to try */
  extensions?: string[];
  /** Alias mappings (e.g., @ -> src) */
  alias?: Record<string, string>;
  /** TypeScript paths from tsconfig */
  paths?: Record<string, string[]>;
  /** Path to tsconfig baseUrl */
  baseUrl?: string;
  /** Main fields to check in package.json */
  mainFields?: string[];
  /** Condition names for exports field */
  conditionNames?: string[];
  /** Whether to resolve for browser */
  browser?: boolean;
  /** External packages (don't resolve) */
  external?: string[];
  /** Cache for resolved paths */
  cache?: Map<string, string | null>;
}

export interface ResolveResult {
  /** Resolved absolute path */
  path: string;
  /** Whether this is an external package */
  external: boolean;
  /** Package name if from node_modules */
  packageName?: string;
  /** Package version */
  packageVersion?: string;
  /** Side effects from package.json */
  sideEffects?: boolean | string[];
}

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cjs', '.cts', '.json'];
const DEFAULT_MAIN_FIELDS = ['module', 'main', 'browser'];
const DEFAULT_CONDITION_NAMES = ['import', 'require', 'default', 'browser', 'node'];

/**
 * Module resolver class
 */
export class ModuleResolver {
  private options: Required<ResolveOptions>;
  private cache: Map<string, string | null>;
  private packageCache: Map<string, any>;

  constructor(options: ResolveOptions) {
    this.options = {
      basedir: options.basedir,
      extensions: options.extensions || DEFAULT_EXTENSIONS,
      alias: options.alias || {},
      paths: options.paths || {},
      baseUrl: options.baseUrl || '',
      mainFields: options.mainFields || DEFAULT_MAIN_FIELDS,
      conditionNames: options.conditionNames || DEFAULT_CONDITION_NAMES,
      browser: options.browser ?? true,
      external: options.external || [],
      cache: options.cache || new Map(),
    };
    this.cache = this.options.cache;
    this.packageCache = new Map();
  }

  /**
   * Resolve an import specifier to an absolute path
   */
  resolve(specifier: string, fromFile?: string): ResolveResult {
    const basedir = fromFile ? path.dirname(fromFile) : this.options.basedir;
    const cacheKey = `${basedir}:${specifier}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached === null) {
        throw new Error(`Cannot resolve module '${specifier}' from '${basedir}'`);
      }
      return { path: cached, external: false };
    }

    try {
      const result = this.resolveInternal(specifier, basedir);
      this.cache.set(cacheKey, result.path);
      return result;
    } catch (error) {
      this.cache.set(cacheKey, null);
      throw error;
    }
  }

  private resolveInternal(specifier: string, basedir: string): ResolveResult {
    // Check if external
    if (this.isExternal(specifier)) {
      return { path: specifier, external: true };
    }

    // Check alias
    const aliased = this.resolveAlias(specifier);
    if (aliased !== specifier) {
      return this.resolveInternal(aliased, basedir);
    }

    // Check TypeScript paths
    const pathsResolved = this.resolvePaths(specifier);
    if (pathsResolved) {
      return { path: pathsResolved, external: false };
    }

    // Relative import
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const resolved = this.resolveRelative(specifier, basedir);
      if (resolved) {
        return { path: resolved, external: false };
      }
      throw new Error(`Cannot resolve '${specifier}' from '${basedir}'`);
    }

    // Bare import (node_modules)
    return this.resolveNodeModule(specifier, basedir);
  }

  private isExternal(specifier: string): boolean {
    // Built-in Node.js modules
    if (specifier.startsWith('node:')) return true;
    
    const builtins = [
      'fs', 'path', 'os', 'util', 'events', 'stream', 'http', 'https',
      'url', 'querystring', 'crypto', 'zlib', 'buffer', 'child_process',
      'cluster', 'dgram', 'dns', 'net', 'readline', 'repl', 'tls', 'tty',
      'v8', 'vm', 'worker_threads', 'assert', 'async_hooks', 'console',
      'constants', 'domain', 'inspector', 'module', 'perf_hooks', 'process',
      'punycode', 'string_decoder', 'sys', 'timers', 'trace_events', 'wasi',
    ];
    
    const name = specifier.split('/')[0];
    if (builtins.includes(name)) return true;

    // User-defined externals
    return this.options.external.some(ext => {
      if (ext === specifier) return true;
      if (ext.endsWith('*') && specifier.startsWith(ext.slice(0, -1))) return true;
      return false;
    });
  }

  private resolveAlias(specifier: string): string {
    for (const [alias, target] of Object.entries(this.options.alias)) {
      if (specifier === alias) {
        return target;
      }
      if (specifier.startsWith(alias + '/')) {
        return target + specifier.slice(alias.length);
      }
    }
    return specifier;
  }

  private resolvePaths(specifier: string): string | null {
    if (!this.options.baseUrl) return null;

    for (const [pattern, targets] of Object.entries(this.options.paths)) {
      const regex = this.patternToRegex(pattern);
      const match = specifier.match(regex);
      
      if (match) {
        for (const target of targets) {
          const resolved = target.replace('*', match[1] || '');
          const fullPath = path.resolve(this.options.baseUrl, resolved);
          const found = this.tryResolveFile(fullPath);
          if (found) return found;
        }
      }
    }

    return null;
  }

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withWildcard = escaped.replace('\\*', '(.*)');
    return new RegExp(`^${withWildcard}$`);
  }

  private resolveRelative(specifier: string, basedir: string): string | null {
    const absolutePath = path.resolve(basedir, specifier);
    return this.tryResolveFile(absolutePath) || this.tryResolveDirectory(absolutePath);
  }

  private tryResolveFile(filePath: string): string | null {
    // Exact file
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }

    // Try extensions
    for (const ext of this.options.extensions) {
      const withExt = filePath + ext;
      if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
        return withExt;
      }
    }

    return null;
  }

  private tryResolveDirectory(dirPath: string): string | null {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return null;
    }

    // Check package.json
    const pkgPath = path.join(dirPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = this.readPackageJson(pkgPath);
      const main = this.getMainFromPackage(pkg);
      if (main) {
        const mainPath = path.resolve(dirPath, main);
        const resolved = this.tryResolveFile(mainPath);
        if (resolved) return resolved;
      }
    }

    // Try index files
    return this.tryResolveFile(path.join(dirPath, 'index'));
  }

  private resolveNodeModule(specifier: string, basedir: string): ResolveResult {
    const parts = specifier.split('/');
    const isScoped = specifier.startsWith('@');
    const packageName = isScoped ? `${parts[0]}/${parts[1]}` : parts[0];
    const subpath = isScoped ? parts.slice(2).join('/') : parts.slice(1).join('/');

    // Walk up directories looking for node_modules
    let current = basedir;
    while (current !== path.dirname(current)) {
      const nodeModulesPath = path.join(current, 'node_modules', packageName);
      
      if (fs.existsSync(nodeModulesPath)) {
        const pkgPath = path.join(nodeModulesPath, 'package.json');
        
        if (fs.existsSync(pkgPath)) {
          const pkg = this.readPackageJson(pkgPath);
          
          // Check exports field first
          if (pkg.exports && subpath) {
            const resolved = this.resolveExports(pkg.exports, './' + subpath, nodeModulesPath);
            if (resolved) {
              return {
                path: resolved,
                external: false,
                packageName,
                packageVersion: pkg.version,
                sideEffects: pkg.sideEffects,
              };
            }
          }

          // Resolve subpath or main
          let targetPath: string;
          if (subpath) {
            targetPath = path.join(nodeModulesPath, subpath);
          } else {
            // Check exports for main entry
            if (pkg.exports) {
              const resolved = this.resolveExports(pkg.exports, '.', nodeModulesPath);
              if (resolved) {
                return {
                  path: resolved,
                  external: false,
                  packageName,
                  packageVersion: pkg.version,
                  sideEffects: pkg.sideEffects,
                };
              }
            }

            const main = this.getMainFromPackage(pkg);
            targetPath = main ? path.join(nodeModulesPath, main) : nodeModulesPath;
          }

          const resolved = this.tryResolveFile(targetPath) || this.tryResolveDirectory(targetPath);
          if (resolved) {
            return {
              path: resolved,
              external: false,
              packageName,
              packageVersion: pkg.version,
              sideEffects: pkg.sideEffects,
            };
          }
        }
      }

      current = path.dirname(current);
    }

    throw new Error(`Cannot find module '${specifier}' from '${basedir}'`);
  }

  private resolveExports(
    exports: any,
    subpath: string,
    packagePath: string
  ): string | null {
    // String shorthand
    if (typeof exports === 'string') {
      if (subpath === '.') {
        return path.join(packagePath, exports);
      }
      return null;
    }

    // Array (try each)
    if (Array.isArray(exports)) {
      for (const exp of exports) {
        const resolved = this.resolveExports(exp, subpath, packagePath);
        if (resolved) return resolved;
      }
      return null;
    }

    // Object
    if (typeof exports === 'object' && exports !== null) {
      // Check for subpath match
      if (subpath in exports) {
        return this.resolveExportsTarget(exports[subpath], packagePath);
      }

      // Check for pattern match
      for (const [pattern, target] of Object.entries(exports)) {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace('*', '(.+)') + '$');
          const match = subpath.match(regex);
          if (match) {
            const resolved = this.resolveExportsTarget(target, packagePath);
            if (resolved) {
              return resolved.replace('*', match[1]);
            }
          }
        }
      }

      // Check condition names
      for (const condition of this.options.conditionNames) {
        if (condition in exports) {
          return this.resolveExports(exports[condition], subpath, packagePath);
        }
      }
    }

    return null;
  }

  private resolveExportsTarget(target: any, packagePath: string): string | null {
    if (typeof target === 'string') {
      return path.join(packagePath, target);
    }

    if (typeof target === 'object' && target !== null) {
      for (const condition of this.options.conditionNames) {
        if (condition in target) {
          return this.resolveExportsTarget(target[condition], packagePath);
        }
      }
    }

    return null;
  }

  private getMainFromPackage(pkg: any): string | null {
    // Browser field (if browser target)
    if (this.options.browser && pkg.browser) {
      if (typeof pkg.browser === 'string') {
        return pkg.browser;
      }
    }

    // Main fields in order
    for (const field of this.options.mainFields) {
      if (pkg[field]) {
        return pkg[field];
      }
    }

    return null;
  }

  private readPackageJson(pkgPath: string): any {
    if (this.packageCache.has(pkgPath)) {
      return this.packageCache.get(pkgPath);
    }

    try {
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      this.packageCache.set(pkgPath, pkg);
      return pkg;
    } catch {
      return {};
    }
  }

  /**
   * Clear the resolution cache
   */
  clearCache(): void {
    this.cache.clear();
    this.packageCache.clear();
  }
}

/**
 * Create a resolver instance
 */
export function createResolver(options: ResolveOptions): ModuleResolver {
  return new ModuleResolver(options);
}

/**
 * Resolve a module specifier
 */
export function resolveModule(
  specifier: string,
  options: ResolveOptions
): ResolveResult {
  return new ModuleResolver(options).resolve(specifier);
}
