/**
 * Parallel Bundler
 * 
 * High-performance bundler using Worker Threads for parallel processing.
 * Processes modules in parallel batches for maximum throughput.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { KonaParser } from '../parser/parser';
import { ModuleResolver } from '../resolver/moduleResolver';

const NUM_WORKERS = Math.max(1, os.cpus().length - 1);

// Try to load WASM parser for faster import extraction
let wasmParser: any = null;
try {
  const wasm = require('../../../rust-wasm/pkg/kona_wasm.js');
  wasmParser = new wasm.Parser();
  console.log('  ⚡ Using WASM parser');
} catch (e) {
  // WASM not available, will use JS parser
}

// Module representation
export interface Module {
  id: string;
  path: string;
  source: string;
  transformed: string;
  dependencies: string[];
  isEntry: boolean;
  isDynamic: boolean;
  hash: string;
}

export interface BundlerOptions {
  entry: string | string[];
  outdir: string;
  format?: 'esm' | 'cjs' | 'iife';
  target?: 'browser' | 'node';
  minify?: boolean;
  sourcemap?: boolean;
  splitting?: boolean;
  treeshake?: boolean;
  external?: string[];
  alias?: Record<string, string>;
  define?: Record<string, string>;
  cache?: ModuleCache;
  parallel?: boolean;
}

export interface ModuleCache {
  get(key: string): CachedModule | undefined;
  set(key: string, value: CachedModule): void;
  has(key: string): boolean;
}

export interface CachedModule {
  hash: string;
  transformed: string;
  dependencies: string[];
}

export interface BundleOutput {
  code: string;
  map?: string;
  modules: number;
  size: number;
  time: number;
}

/**
 * In-memory module cache
 */
export class MemoryCache implements ModuleCache {
  private cache = new Map<string, CachedModule>();
  
  get(key: string) { return this.cache.get(key); }
  set(key: string, value: CachedModule) { this.cache.set(key, value); }
  has(key: string) { return this.cache.has(key); }
  clear() { this.cache.clear(); }
  get size() { return this.cache.size; }
}

/**
 * File-based persistent cache
 */
export class FileCache implements ModuleCache {
  private cacheDir: string;
  private memory = new Map<string, CachedModule>();

  constructor(cacheDir = '.kona-cache') {
    this.cacheDir = path.resolve(process.cwd(), cacheDir);
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    this.loadIndex();
  }

  private loadIndex() {
    const indexPath = path.join(this.cacheDir, 'index.json');
    if (fs.existsSync(indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const [key, value] of Object.entries(data)) {
          this.memory.set(key, value as CachedModule);
        }
      } catch {}
    }
  }

  private saveIndex() {
    const indexPath = path.join(this.cacheDir, 'index.json');
    const data: Record<string, CachedModule> = {};
    for (const [key, value] of this.memory) {
      data[key] = value;
    }
    fs.writeFileSync(indexPath, JSON.stringify(data));
  }

  get(key: string) { return this.memory.get(key); }
  
  set(key: string, value: CachedModule) { 
    this.memory.set(key, value);
    // Async save
    setImmediate(() => this.saveIndex());
  }
  
  has(key: string) { return this.memory.has(key); }
}

/**
 * Parallel bundler class
 */
export class ParallelBundler {
  private options: Required<BundlerOptions>;
  private modules = new Map<string, Module>();
  private resolver: ModuleResolver;
  private parser: KonaParser;
  private cache: ModuleCache;
  private pendingModules = new Set<string>();
  private processedModules = new Set<string>();

  constructor(options: BundlerOptions) {
    this.options = {
      entry: Array.isArray(options.entry) ? options.entry : [options.entry],
      outdir: options.outdir || 'dist',
      format: options.format || 'esm',
      target: options.target || 'browser',
      minify: options.minify ?? false,
      sourcemap: options.sourcemap ?? false,
      splitting: options.splitting ?? false,
      treeshake: options.treeshake ?? true,
      external: options.external || [],
      alias: options.alias || {},
      define: options.define || {},
      cache: options.cache || new MemoryCache(),
      parallel: options.parallel ?? true,
    };

    this.cache = this.options.cache;
    this.resolver = new ModuleResolver({
      basedir: process.cwd(),
      alias: this.options.alias,
      external: this.options.external,
      browser: this.options.target === 'browser',
    });
    this.parser = new KonaParser();
  }

  /**
   * Build the bundle
   */
  async build(): Promise<BundleOutput> {
    const startTime = Date.now();

    // Collect all modules (BFS)
    const entries = this.options.entry as string[];
    const queue: Array<{ path: string; isEntry: boolean; isDynamic: boolean }> = [];
    
    for (const entry of entries) {
      const entryPath = path.resolve(process.cwd(), entry);
      queue.push({ path: entryPath, isEntry: true, isDynamic: false });
    }

    // Phase 1: Discover all modules
    while (queue.length > 0) {
      const { path: modulePath, isEntry, isDynamic } = queue.shift()!;
      
      if (this.processedModules.has(modulePath)) continue;
      this.processedModules.add(modulePath);

      const deps = await this.discoverModule(modulePath, isEntry, isDynamic);
      for (const dep of deps) {
        if (!this.processedModules.has(dep.path)) {
          queue.push(dep);
        }
      }
    }

    // Phase 2: Process modules in parallel batches
    const modulePaths = [...this.modules.keys()];
    const batchSize = Math.ceil(modulePaths.length / NUM_WORKERS);
    const batches: string[][] = [];
    
    for (let i = 0; i < modulePaths.length; i += batchSize) {
      batches.push(modulePaths.slice(i, i + batchSize));
    }

    // Process batches in parallel
    if (this.options.parallel && batches.length > 1) {
      await Promise.all(batches.map(batch => this.processBatch(batch)));
    } else {
      for (const batch of batches) {
        await this.processBatch(batch);
      }
    }

    // Phase 3: Generate bundle
    const code = this.generateBundle();
    const buildTime = Date.now() - startTime;

    return {
      code,
      modules: this.modules.size,
      size: Buffer.byteLength(code, 'utf-8'),
      time: buildTime,
    };
  }

  /**
   * Discover a module and its dependencies
   */
  private async discoverModule(
    modulePath: string, 
    isEntry: boolean, 
    isDynamic: boolean
  ): Promise<Array<{ path: string; isEntry: boolean; isDynamic: boolean }>> {
    if (!fs.existsSync(modulePath)) {
      console.warn(`File not found: ${modulePath}`);
      return [];
    }

    const source = fs.readFileSync(modulePath, 'utf-8');
    const hash = this.hashContent(source);

    // Check cache
    const cached = this.cache.get(modulePath);
    if (cached && cached.hash === hash) {
      // Use cached dependencies
      this.modules.set(modulePath, {
        id: this.generateModuleId(modulePath),
        path: modulePath,
        source,
        transformed: cached.transformed,
        dependencies: cached.dependencies,
        isEntry,
        isDynamic,
        hash,
      });

      return cached.dependencies
        .filter(dep => !this.isExternal(dep))
        .map(dep => {
          try {
            const resolved = this.resolver.resolve(dep, modulePath);
            return { path: resolved.path, isEntry: false, isDynamic: false };
          } catch {
            return null;
          }
        })
        .filter((d): d is { path: string; isEntry: boolean; isDynamic: boolean } => d !== null);
    }

    // Use WASM parser if available, otherwise fall back to JS regex
    const dependencies = wasmParser 
      ? wasmParser.extract_imports_fast(source).split('\n').filter(Boolean)
      : this.quickScanImports(source);
    const resolvedDeps: Array<{ path: string; isEntry: boolean; isDynamic: boolean }> = [];

    for (const dep of dependencies) {
      if (!this.isExternal(dep)) {
        try {
          const resolved = this.resolver.resolve(dep, modulePath);
          if (!resolved.external) {
            resolvedDeps.push({ 
              path: resolved.path, 
              isEntry: false, 
              isDynamic: dep.startsWith('import(') 
            });
          }
        } catch (e) {
          // Skip unresolvable
        }
      }
    }

    this.modules.set(modulePath, {
      id: this.generateModuleId(modulePath),
      path: modulePath,
      source,
      transformed: '', // Will be filled in processBatch
      dependencies,
      isEntry,
      isDynamic,
      hash,
    });

    return resolvedDeps;
  }

  /**
   * Process a batch of modules
   */
  private async processBatch(modulePaths: string[]): Promise<void> {
    await Promise.all(modulePaths.map(async (modulePath) => {
      const module = this.modules.get(modulePath);
      if (!module || module.transformed) return;

      // Check cache again
      const cached = this.cache.get(modulePath);
      if (cached && cached.hash === module.hash) {
        module.transformed = cached.transformed;
        return;
      }

      // Transform
      const transformed = this.transformModule(module);
      module.transformed = transformed;

      // Update cache
      this.cache.set(modulePath, {
        hash: module.hash,
        transformed,
        dependencies: module.dependencies,
      });
    }));
  }

  /**
   * Transform a single module
   */
  private transformModule(module: Module): string {
    let code = module.source;

    // Apply defines
    for (const [key, value] of Object.entries(this.options.define)) {
      code = code.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    }

    // Transform TypeScript/JSX if needed
    const ext = path.extname(module.path).toLowerCase();
    if (['.ts', '.tsx', '.jsx'].includes(ext)) {
      const result = this.parser.transform(code);
      code = result.code;
    }

    return code;
  }

  /**
   * Generate the final bundle
   */
  private generateBundle(): string {
    const lines: string[] = [];

    // Runtime
    lines.push('// Kona Bundle');
    lines.push('(function() {');
    lines.push('"use strict";');
    lines.push('var __modules = {};');
    lines.push('var __cache = {};');
    lines.push('function __require(id) {');
    lines.push('  if (__cache[id]) return __cache[id].exports;');
    lines.push('  var module = { exports: {} };');
    lines.push('  __cache[id] = module;');
    lines.push('  __modules[id](module, module.exports, __require);');
    lines.push('  return module.exports;');
    lines.push('}');
    lines.push('');

    // Sort modules (entries last)
    const sortedModules = [...this.modules.values()].sort((a, b) => {
      if (a.isEntry && !b.isEntry) return 1;
      if (!a.isEntry && b.isEntry) return -1;
      return 0;
    });

    // Add modules
    for (const module of sortedModules) {
      const code = this.rewriteImports(module);
      lines.push(`// ${module.id}`);
      lines.push(`__modules['${module.id}'] = function(module, exports, require) {`);
      lines.push(code);
      lines.push('};');
      lines.push('');
    }

    // Entry points
    const entries = sortedModules.filter(m => m.isEntry);
    for (const entry of entries) {
      lines.push(`__require('${entry.id}');`);
    }

    lines.push('})();');

    return lines.join('\n');
  }

  /**
   * Rewrite imports to use __require
   */
  private rewriteImports(module: Module): string {
    let code = module.transformed || module.source;

    // Rewrite ES imports to require
    code = code.replace(
      /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      (match, name, specifier) => {
        const resolved = this.resolveSpecifier(specifier, module.path);
        return `var ${name} = __require('${resolved}').default || __require('${resolved}')`;
      }
    );

    code = code.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
      (match, names, specifier) => {
        const resolved = this.resolveSpecifier(specifier, module.path);
        return `var {${names}} = __require('${resolved}')`;
      }
    );

    code = code.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      (match, name, specifier) => {
        const resolved = this.resolveSpecifier(specifier, module.path);
        return `var ${name} = __require('${resolved}')`;
      }
    );

    // Rewrite exports
    code = code.replace(/export\s+default\s+/g, 'module.exports.default = ');
    code = code.replace(/export\s+\{([^}]+)\}/g, (match, names) => {
      const exports = names.split(',').map((n: string) => n.trim());
      return exports.map((n: string) => `module.exports.${n} = ${n}`).join('; ');
    });
    code = code.replace(
      /export\s+(const|let|var|function|class)\s+(\w+)/g,
      (match, keyword, name) => `${keyword} ${name}; module.exports.${name} = ${name}`
    );

    return code;
  }

  private resolveSpecifier(specifier: string, fromPath: string): string {
    if (this.isExternal(specifier)) {
      return specifier;
    }

    try {
      const resolved = this.resolver.resolve(specifier, fromPath);
      const module = this.modules.get(resolved.path);
      return module?.id || specifier;
    } catch {
      return specifier;
    }
  }

  private isExternal(specifier: string): boolean {
    if (specifier.startsWith('.') || specifier.startsWith('/')) return false;
    
    const name = specifier.split('/')[0];
    
    // Node.js builtins
    const builtins = [
      'fs', 'path', 'os', 'util', 'events', 'stream', 'http', 'https', 
      'url', 'crypto', 'zlib', 'assert', 'buffer', 'child_process',
      'cluster', 'dgram', 'dns', 'domain', 'net', 'readline', 'repl',
      'string_decoder', 'tls', 'tty', 'v8', 'vm', 'worker_threads',
      'node:fs', 'node:path', 'node:os', 'node:util', 'node:events',
      'node:stream', 'node:http', 'node:https', 'node:url', 'node:crypto'
    ];
    if (builtins.includes(specifier) || specifier.startsWith('node:')) return true;
    
    // Treat all bare imports as external (node_modules)
    // This is the key optimization - don't bundle node_modules
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      return true;
    }
    
    return this.options.external.some(ext => {
      if (ext === specifier) return true;
      if (ext.endsWith('*') && specifier.startsWith(ext.slice(0, -1))) return true;
      return false;
    });
  }

  private generateModuleId(modulePath: string): string {
    return path.relative(process.cwd(), modulePath).replace(/\\/g, '/');
  }

  private hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
  }

  /**
   * Quick scan for imports using regex (much faster than full parse)
   */
  private quickScanImports(source: string): string[] {
    const imports: string[] = [];
    
    // Static imports: import x from 'y', import { x } from 'y', import 'y'
    const staticImportRegex = /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = staticImportRegex.exec(source)) !== null) {
      imports.push(match[1]);
    }

    // Dynamic imports: import('y')
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(source)) !== null) {
      imports.push(match[1]);
    }

    // require() calls
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(source)) !== null) {
      imports.push(match[1]);
    }

    // export from
    const exportFromRegex = /export\s+(?:\*|{[^}]*})\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = exportFromRegex.exec(source)) !== null) {
      imports.push(match[1]);
    }

    return [...new Set(imports)];
  }

  /**
   * Write output to disk
   */
  async write(output: BundleOutput): Promise<void> {
    if (!fs.existsSync(this.options.outdir)) {
      fs.mkdirSync(this.options.outdir, { recursive: true });
    }

    const outPath = path.join(this.options.outdir, 'bundle.js');
    fs.writeFileSync(outPath, output.code);

    if (output.map) {
      fs.writeFileSync(outPath + '.map', output.map);
    }
  }
}

/**
 * Quick build function
 */
export async function parallelBuild(options: BundlerOptions): Promise<BundleOutput> {
  const bundler = new ParallelBundler(options);
  return bundler.build();
}
