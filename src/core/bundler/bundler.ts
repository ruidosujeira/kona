/**
 * Kona Bundler
 * 
 * Core bundling engine that:
 * - Builds dependency graph
 * - Concatenates modules into chunks
 * - Applies tree shaking
 * - Generates output bundles
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { KonaParser, ParseResult, ImportInfo } from '../parser/parser';
import { ModuleResolver, ResolveResult } from '../resolver/moduleResolver';

// Module representation
export interface Module {
  id: string;
  path: string;
  source: string;
  transformed: string;
  parseResult: ParseResult;
  dependencies: Dependency[];
  dependents: Set<string>;
  isEntry: boolean;
  isDynamic: boolean;
  chunk?: string;
  hash: string;
  sideEffects: boolean;
}

export interface Dependency {
  specifier: string;
  resolved: string;
  isDynamic: boolean;
  isTypeOnly: boolean;
}

// Chunk representation
export interface Chunk {
  id: string;
  name: string;
  modules: string[];
  imports: string[];
  exports: string[];
  isEntry: boolean;
  isDynamic: boolean;
  code: string;
  map?: string;
  hash: string;
  size: number;
}

// Bundle output
export interface BundleOutput {
  chunks: Chunk[];
  assets: Asset[];
  modules: Map<string, Module>;
  stats: BundleStats;
}

export interface Asset {
  name: string;
  source: Buffer | string;
  type: string;
}

export interface BundleStats {
  modules: number;
  chunks: number;
  assets: number;
  totalSize: number;
  buildTime: number;
}

// Bundler options
export interface BundlerOptions {
  entry: string | string[];
  outdir: string;
  format?: 'esm' | 'cjs' | 'iife';
  target?: 'browser' | 'node';
  minify?: boolean;
  sourcemap?: boolean | 'inline' | 'external';
  splitting?: boolean;
  treeshake?: boolean;
  external?: string[];
  alias?: Record<string, string>;
  define?: Record<string, string>;
  plugins?: BundlerPlugin[];
  onProgress?: (message: string) => void;
}

// Plugin interface
export interface BundlerPlugin {
  name: string;
  setup: (build: PluginBuild) => void | Promise<void>;
}

export interface PluginBuild {
  onResolve: (options: OnResolveOptions, callback: OnResolveCallback) => void;
  onLoad: (options: OnLoadOptions, callback: OnLoadCallback) => void;
  onTransform: (options: OnTransformOptions, callback: OnTransformCallback) => void;
}

export interface OnResolveOptions {
  filter: RegExp;
  namespace?: string;
}

export interface OnResolveCallback {
  (args: OnResolveArgs): OnResolveResult | null | undefined | Promise<OnResolveResult | null | undefined>;
}

export interface OnResolveArgs {
  path: string;
  importer: string;
  namespace: string;
  kind: 'import' | 'require' | 'dynamic' | 'entry';
}

export interface OnResolveResult {
  path?: string;
  external?: boolean;
  namespace?: string;
  sideEffects?: boolean;
}

export interface OnLoadOptions {
  filter: RegExp;
  namespace?: string;
}

export interface OnLoadCallback {
  (args: OnLoadArgs): OnLoadResult | null | undefined | Promise<OnLoadResult | null | undefined>;
}

export interface OnLoadArgs {
  path: string;
  namespace: string;
}

export interface OnLoadResult {
  contents?: string;
  loader?: 'js' | 'ts' | 'jsx' | 'tsx' | 'json' | 'css' | 'text' | 'binary';
  resolveDir?: string;
}

export interface OnTransformOptions {
  filter: RegExp;
}

export interface OnTransformCallback {
  (args: OnTransformArgs): OnTransformResult | null | undefined | Promise<OnTransformResult | null | undefined>;
}

export interface OnTransformArgs {
  path: string;
  contents: string;
  loader: string;
}

export interface OnTransformResult {
  contents?: string;
  map?: string;
}

/**
 * Main bundler class
 */
export class Bundler {
  private options: Required<BundlerOptions>;
  private modules: Map<string, Module> = new Map();
  private chunks: Map<string, Chunk> = new Map();
  private resolver: ModuleResolver;
  private parser: KonaParser;
  
  // Plugin hooks
  private resolveCallbacks: Array<{ filter: RegExp; callback: OnResolveCallback }> = [];
  private loadCallbacks: Array<{ filter: RegExp; callback: OnLoadCallback }> = [];
  private transformCallbacks: Array<{ filter: RegExp; callback: OnTransformCallback }> = [];

  constructor(options: BundlerOptions) {
    this.options = {
      entry: Array.isArray(options.entry) ? options.entry : [options.entry],
      outdir: options.outdir,
      format: options.format || 'esm',
      target: options.target || 'browser',
      minify: options.minify ?? false,
      sourcemap: options.sourcemap ?? true,
      splitting: options.splitting ?? true,
      treeshake: options.treeshake ?? true,
      external: options.external || [],
      alias: options.alias || {},
      define: options.define || {},
      plugins: options.plugins || [],
      onProgress: options.onProgress || (() => {}),
    };

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
    
    // Setup plugins
    await this.setupPlugins();

    // Build dependency graph
    this.options.onProgress?.('Building dependency graph...');
    const entries = Array.isArray(this.options.entry) ? this.options.entry : [this.options.entry];
    
    for (const entry of entries) {
      const entryPath = path.resolve(process.cwd(), entry);
      await this.processModule(entryPath, true);
    }

    // Tree shaking
    if (this.options.treeshake) {
      this.options.onProgress?.('Tree shaking...');
      this.treeShake();
    }

    // Code splitting
    if (this.options.splitting) {
      this.options.onProgress?.('Code splitting...');
      this.splitCode();
    } else {
      this.createSingleChunk();
    }

    // Generate chunks
    this.options.onProgress?.('Generating bundles...');
    const chunks = this.generateChunks();

    // Collect stats
    const stats: BundleStats = {
      modules: this.modules.size,
      chunks: chunks.length,
      assets: 0,
      totalSize: chunks.reduce((sum, c) => sum + c.size, 0),
      buildTime: Date.now() - startTime,
    };

    return {
      chunks,
      assets: [],
      modules: this.modules,
      stats,
    };
  }

  private async setupPlugins(): Promise<void> {
    const build: PluginBuild = {
      onResolve: (options, callback) => {
        this.resolveCallbacks.push({ filter: options.filter, callback });
      },
      onLoad: (options, callback) => {
        this.loadCallbacks.push({ filter: options.filter, callback });
      },
      onTransform: (options, callback) => {
        this.transformCallbacks.push({ filter: options.filter, callback });
      },
    };

    for (const plugin of this.options.plugins) {
      await plugin.setup(build);
    }
  }

  private async processModule(modulePath: string, isEntry = false, isDynamic = false): Promise<Module | null> {
    // Check if already processed
    if (this.modules.has(modulePath)) {
      return this.modules.get(modulePath)!;
    }

    // Run resolve callbacks
    for (const { filter, callback } of this.resolveCallbacks) {
      if (filter.test(modulePath)) {
        const result = await callback({
          path: modulePath,
          importer: '',
          namespace: 'file',
          kind: isEntry ? 'entry' : isDynamic ? 'dynamic' : 'import',
        });
        if (result?.external) {
          return null;
        }
        if (result?.path) {
          modulePath = result.path;
        }
      }
    }

    // Load source
    let source: string;
    let loader = this.getLoader(modulePath);

    // Run load callbacks
    for (const { filter, callback } of this.loadCallbacks) {
      if (filter.test(modulePath)) {
        const result = await callback({ path: modulePath, namespace: 'file' });
        if (result?.contents) {
          source = result.contents;
          if (result.loader) loader = result.loader;
          break;
        }
      }
    }

    // Default load
    if (!source!) {
      if (!fs.existsSync(modulePath)) {
        throw new Error(`File not found: ${modulePath}`);
      }
      source = fs.readFileSync(modulePath, 'utf-8');
    }

    // Parse
    const parseResult = this.parser.parse(source);

    // Transform
    let transformed = source;
    
    // Run transform callbacks
    for (const { filter, callback } of this.transformCallbacks) {
      if (filter.test(modulePath)) {
        const result = await callback({ path: modulePath, contents: transformed, loader });
        if (result?.contents) {
          transformed = result.contents;
        }
      }
    }

    // Apply defines
    transformed = this.applyDefines(transformed);

    // Create module
    const module: Module = {
      id: this.generateModuleId(modulePath),
      path: modulePath,
      source,
      transformed,
      parseResult,
      dependencies: [],
      dependents: new Set(),
      isEntry,
      isDynamic,
      hash: this.hashContent(transformed),
      sideEffects: true, // TODO: check package.json
    };

    this.modules.set(modulePath, module);

    // Process dependencies
    for (const imp of parseResult.imports) {
      if (imp.isTypeOnly) continue;

      try {
        const resolved = this.resolver.resolve(imp.source, modulePath);
        
        if (!resolved.external) {
          module.dependencies.push({
            specifier: imp.source,
            resolved: resolved.path,
            isDynamic: imp.isDynamic,
            isTypeOnly: imp.isTypeOnly,
          });

          // Recursively process
          const depModule = await this.processModule(resolved.path, false, imp.isDynamic);
          if (depModule) {
            depModule.dependents.add(modulePath);
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not resolve '${imp.source}' from '${modulePath}'`);
      }
    }

    return module;
  }

  private getLoader(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts': return 'ts';
      case '.tsx': return 'tsx';
      case '.jsx': return 'jsx';
      case '.json': return 'json';
      case '.css': return 'css';
      case '.mjs':
      case '.cjs':
      case '.js':
      default:
        return 'js';
    }
  }

  private applyDefines(code: string): string {
    let result = code;
    for (const [key, value] of Object.entries(this.options.define)) {
      result = result.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    }
    return result;
  }

  private generateModuleId(modulePath: string): string {
    const relative = path.relative(process.cwd(), modulePath);
    return relative.replace(/\\/g, '/');
  }

  private hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
  }

  /**
   * Tree shaking - remove unused exports
   */
  private treeShake(): void {
    // Build usage graph
    const usedExports = new Map<string, Set<string>>();

    // Mark all entry exports as used
    for (const [path, module] of this.modules) {
      if (module.isEntry) {
        usedExports.set(path, new Set(['*']));
      }
    }

    // Propagate usage
    let changed = true;
    while (changed) {
      changed = false;
      
      for (const [modulePath, module] of this.modules) {
        if (!usedExports.has(modulePath)) continue;

        for (const dep of module.dependencies) {
          if (!usedExports.has(dep.resolved)) {
            usedExports.set(dep.resolved, new Set());
            changed = true;
          }

          // For now, mark all imports as used
          // TODO: Track specific imports
          const depUsed = usedExports.get(dep.resolved)!;
          if (!depUsed.has('*')) {
            depUsed.add('*');
            changed = true;
          }
        }
      }
    }

    // Remove unused modules
    for (const [path, module] of this.modules) {
      if (!usedExports.has(path) && !module.sideEffects) {
        this.modules.delete(path);
      }
    }
  }

  /**
   * Code splitting - create chunks for dynamic imports
   */
  private splitCode(): void {
    // Entry chunks
    for (const [path, module] of this.modules) {
      if (module.isEntry) {
        module.chunk = `entry-${this.hashContent(path).slice(0, 6)}`;
      }
    }

    // Dynamic import chunks
    for (const [path, module] of this.modules) {
      if (module.isDynamic && !module.chunk) {
        module.chunk = `chunk-${this.hashContent(path).slice(0, 6)}`;
      }
    }

    // Assign remaining modules to their importer's chunk
    let changed = true;
    while (changed) {
      changed = false;
      
      for (const [path, module] of this.modules) {
        if (module.chunk) continue;

        // Find a dependent with a chunk
        for (const depPath of module.dependents) {
          const dep = this.modules.get(depPath);
          if (dep?.chunk) {
            module.chunk = dep.chunk;
            changed = true;
            break;
          }
        }
      }
    }

    // Fallback: assign to first entry chunk
    const firstEntryChunk = [...this.modules.values()].find(m => m.isEntry)?.chunk;
    for (const [path, module] of this.modules) {
      if (!module.chunk) {
        module.chunk = firstEntryChunk || 'main';
      }
    }
  }

  private createSingleChunk(): void {
    for (const [path, module] of this.modules) {
      module.chunk = 'bundle';
    }
  }

  /**
   * Generate final chunk code
   */
  private generateChunks(): Chunk[] {
    // Group modules by chunk
    const chunkModules = new Map<string, Module[]>();
    
    for (const [path, module] of this.modules) {
      const chunkId = module.chunk || 'main';
      if (!chunkModules.has(chunkId)) {
        chunkModules.set(chunkId, []);
      }
      chunkModules.get(chunkId)!.push(module);
    }

    // Generate each chunk
    const chunks: Chunk[] = [];

    for (const [chunkId, modules] of chunkModules) {
      const isEntry = modules.some(m => m.isEntry);
      const isDynamic = modules.some(m => m.isDynamic) && !isEntry;

      // Sort modules (entries first, then by dependency order)
      const sorted = this.topologicalSort(modules);

      // Generate code
      const code = this.generateChunkCode(sorted, chunkId);
      const hash = this.hashContent(code);

      chunks.push({
        id: chunkId,
        name: isEntry ? 'index' : chunkId,
        modules: sorted.map(m => m.id),
        imports: this.getChunkImports(sorted, chunkId),
        exports: this.getChunkExports(sorted),
        isEntry,
        isDynamic,
        code,
        hash,
        size: Buffer.byteLength(code, 'utf-8'),
      });
    }

    return chunks;
  }

  private topologicalSort(modules: Module[]): Module[] {
    const result: Module[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (module: Module) => {
      if (visited.has(module.path)) return;
      if (visiting.has(module.path)) return; // Circular dependency

      visiting.add(module.path);

      for (const dep of module.dependencies) {
        const depModule = this.modules.get(dep.resolved);
        if (depModule && modules.includes(depModule)) {
          visit(depModule);
        }
      }

      visiting.delete(module.path);
      visited.add(module.path);
      result.push(module);
    };

    for (const module of modules) {
      visit(module);
    }

    return result;
  }

  private generateChunkCode(modules: Module[], chunkId: string): string {
    if (this.options.format === 'esm') {
      return this.generateESMChunk(modules, chunkId);
    } else if (this.options.format === 'cjs') {
      return this.generateCJSChunk(modules, chunkId);
    } else {
      return this.generateIIFEChunk(modules, chunkId);
    }
  }

  private generateESMChunk(modules: Module[], chunkId: string): string {
    const lines: string[] = [];

    // Collect external imports
    const externalImports = new Map<string, Set<string>>();
    
    for (const module of modules) {
      for (const dep of module.dependencies) {
        if (!this.modules.has(dep.resolved)) {
          // External
          if (!externalImports.has(dep.specifier)) {
            externalImports.set(dep.specifier, new Set());
          }
        }
      }
    }

    // Add external imports at top
    for (const [specifier] of externalImports) {
      lines.push(`import * as __external_${this.sanitizeId(specifier)} from '${specifier}';`);
    }

    if (externalImports.size > 0) {
      lines.push('');
    }

    // Module wrapper
    lines.push('// Kona bundled modules');
    lines.push('const __modules = {};');
    lines.push('const __cache = {};');
    lines.push('');
    lines.push('function __require(id) {');
    lines.push('  if (__cache[id]) return __cache[id].exports;');
    lines.push('  const module = { exports: {} };');
    lines.push('  __cache[id] = module;');
    lines.push('  __modules[id](module, module.exports, __require);');
    lines.push('  return module.exports;');
    lines.push('}');
    lines.push('');

    // Add modules
    for (const module of modules) {
      lines.push(`// ${module.id}`);
      lines.push(`__modules['${module.id}'] = function(module, exports, require) {`);
      
      // Rewrite imports to use __require
      let code = module.transformed;
      
      // Simple import rewriting (basic implementation)
      code = this.rewriteImports(code, module);
      
      lines.push(code);
      lines.push('};');
      lines.push('');
    }

    // Entry point
    const entries = modules.filter(m => m.isEntry);
    for (const entry of entries) {
      lines.push(`// Entry: ${entry.id}`);
      lines.push(`const __entry = __require('${entry.id}');`);
      lines.push('export default __entry.default || __entry;');
      lines.push('export * from __entry;');
    }

    return lines.join('\n');
  }

  private generateCJSChunk(modules: Module[], chunkId: string): string {
    const lines: string[] = [];

    lines.push('"use strict";');
    lines.push('');
    lines.push('const __modules = {};');
    lines.push('const __cache = {};');
    lines.push('');
    lines.push('function __require(id) {');
    lines.push('  if (__cache[id]) return __cache[id].exports;');
    lines.push('  const module = { exports: {} };');
    lines.push('  __cache[id] = module;');
    lines.push('  __modules[id](module, module.exports, __require);');
    lines.push('  return module.exports;');
    lines.push('}');
    lines.push('');

    for (const module of modules) {
      lines.push(`__modules['${module.id}'] = function(module, exports, require) {`);
      lines.push(module.transformed);
      lines.push('};');
      lines.push('');
    }

    const entries = modules.filter(m => m.isEntry);
    for (const entry of entries) {
      lines.push(`module.exports = __require('${entry.id}');`);
    }

    return lines.join('\n');
  }

  private generateIIFEChunk(modules: Module[], chunkId: string): string {
    const lines: string[] = [];

    lines.push('(function() {');
    lines.push('"use strict";');
    lines.push('');
    lines.push('var __modules = {};');
    lines.push('var __cache = {};');
    lines.push('');
    lines.push('function __require(id) {');
    lines.push('  if (__cache[id]) return __cache[id].exports;');
    lines.push('  var module = { exports: {} };');
    lines.push('  __cache[id] = module;');
    lines.push('  __modules[id](module, module.exports, __require);');
    lines.push('  return module.exports;');
    lines.push('}');
    lines.push('');

    for (const module of modules) {
      lines.push(`__modules['${module.id}'] = function(module, exports, require) {`);
      lines.push(module.transformed);
      lines.push('};');
      lines.push('');
    }

    const entries = modules.filter(m => m.isEntry);
    for (const entry of entries) {
      lines.push(`__require('${entry.id}');`);
    }

    lines.push('})();');

    return lines.join('\n');
  }

  private rewriteImports(code: string, module: Module): string {
    // Basic import rewriting
    // In production, use proper AST transformation
    
    let result = code;

    // Rewrite static imports
    result = result.replace(
      /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      (match, name, specifier) => {
        const dep = module.dependencies.find(d => d.specifier === specifier);
        if (dep && this.modules.has(dep.resolved)) {
          const depModule = this.modules.get(dep.resolved)!;
          return `const ${name} = __require('${depModule.id}').default || __require('${depModule.id}')`;
        }
        return match;
      }
    );

    // Rewrite named imports
    result = result.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
      (match, names, specifier) => {
        const dep = module.dependencies.find(d => d.specifier === specifier);
        if (dep && this.modules.has(dep.resolved)) {
          const depModule = this.modules.get(dep.resolved)!;
          return `const {${names}} = __require('${depModule.id}')`;
        }
        return match;
      }
    );

    // Rewrite namespace imports
    result = result.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      (match, name, specifier) => {
        const dep = module.dependencies.find(d => d.specifier === specifier);
        if (dep && this.modules.has(dep.resolved)) {
          const depModule = this.modules.get(dep.resolved)!;
          return `const ${name} = __require('${depModule.id}')`;
        }
        return match;
      }
    );

    // Rewrite exports
    result = result.replace(/export\s+default\s+/g, 'module.exports.default = ');
    result = result.replace(/export\s+\{([^}]+)\}/g, (match, names) => {
      const exports = names.split(',').map((n: string) => n.trim());
      return exports.map((n: string) => `module.exports.${n} = ${n}`).join('; ');
    });
    result = result.replace(/export\s+(const|let|var|function|class)\s+(\w+)/g, 
      (match, keyword, name) => `${keyword} ${name}; module.exports.${name} = ${name}`
    );

    return result;
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, '_');
  }

  private getChunkImports(modules: Module[], chunkId: string): string[] {
    const imports = new Set<string>();
    
    for (const module of modules) {
      for (const dep of module.dependencies) {
        const depModule = this.modules.get(dep.resolved);
        if (depModule && depModule.chunk !== chunkId) {
          imports.add(depModule.chunk!);
        }
      }
    }

    return [...imports];
  }

  private getChunkExports(modules: Module[]): string[] {
    const exports: string[] = [];
    
    for (const module of modules) {
      for (const exp of module.parseResult.exports) {
        if (exp.name) {
          exports.push(exp.name);
        }
      }
    }

    return exports;
  }

  /**
   * Write output to disk
   */
  async write(output: BundleOutput): Promise<void> {
    // Ensure output directory exists
    if (!fs.existsSync(this.options.outdir)) {
      fs.mkdirSync(this.options.outdir, { recursive: true });
    }

    // Write chunks
    for (const chunk of output.chunks) {
      const ext = this.options.format === 'cjs' ? '.cjs' : '.js';
      const filename = `${chunk.name}.${chunk.hash}${ext}`;
      const filepath = path.join(this.options.outdir, filename);
      
      fs.writeFileSync(filepath, chunk.code);

      if (this.options.sourcemap && chunk.map) {
        fs.writeFileSync(filepath + '.map', chunk.map);
      }
    }

    // Write assets
    for (const asset of output.assets) {
      const filepath = path.join(this.options.outdir, asset.name);
      fs.writeFileSync(filepath, asset.source);
    }
  }
}

/**
 * Create a bundler instance
 */
export function createBundler(options: BundlerOptions): Bundler {
  return new Bundler(options);
}

/**
 * Build a bundle
 */
export async function bundle(options: BundlerOptions): Promise<BundleOutput> {
  const bundler = new Bundler(options);
  return bundler.build();
}
