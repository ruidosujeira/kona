/**
 * Kona Plugin System
 * 
 * Extensible plugin architecture with lifecycle hooks:
 * - onResolve: Customize module resolution
 * - onLoad: Custom file loading
 * - onTransform: Transform source code
 * - onBundle: Modify bundle output
 */

import * as path from 'path';
import * as fs from 'fs';

// Plugin hook types
export type OnResolveCallback = (args: OnResolveArgs) => OnResolveResult | null | Promise<OnResolveResult | null>;
export type OnLoadCallback = (args: OnLoadArgs) => OnLoadResult | null | Promise<OnLoadResult | null>;
export type OnTransformCallback = (args: OnTransformArgs) => OnTransformResult | null | Promise<OnTransformResult | null>;
export type OnBundleCallback = (args: OnBundleArgs) => OnBundleResult | null | Promise<OnBundleResult | null>;
export type OnStartCallback = (args: OnStartArgs) => void | Promise<void>;
export type OnEndCallback = (args: OnEndArgs) => void | Promise<void>;

// Hook arguments
export interface OnResolveArgs {
  path: string;
  importer: string;
  namespace: string;
  kind: 'import' | 'require' | 'dynamic' | 'entry';
  resolveDir: string;
  pluginData?: any;
}

export interface OnResolveResult {
  path?: string;
  external?: boolean;
  namespace?: string;
  sideEffects?: boolean;
  pluginData?: any;
  errors?: PluginError[];
  warnings?: PluginWarning[];
}

export interface OnLoadArgs {
  path: string;
  namespace: string;
  suffix: string;
  pluginData?: any;
}

export interface OnLoadResult {
  contents?: string;
  loader?: Loader;
  resolveDir?: string;
  pluginData?: any;
  errors?: PluginError[];
  warnings?: PluginWarning[];
  watchFiles?: string[];
  watchDirs?: string[];
}

export interface OnTransformArgs {
  path: string;
  contents: string;
  loader: Loader;
  namespace: string;
  pluginData?: any;
}

export interface OnTransformResult {
  contents?: string;
  map?: string;
  loader?: Loader;
  errors?: PluginError[];
  warnings?: PluginWarning[];
}

export interface OnBundleArgs {
  chunks: BundleChunk[];
  outputDir: string;
}

export interface OnBundleResult {
  chunks?: BundleChunk[];
}

export interface OnStartArgs {
  initialOptions: BuildOptions;
}

export interface OnEndArgs {
  result: BuildResult;
}

// Supporting types
export type Loader = 'js' | 'jsx' | 'ts' | 'tsx' | 'json' | 'css' | 'text' | 'binary' | 'base64' | 'dataurl' | 'file' | 'copy';

export interface BundleChunk {
  name: string;
  code: string;
  map?: string;
  isEntry: boolean;
  modules: string[];
}

export interface BuildOptions {
  entry: string[];
  outdir: string;
  format: 'esm' | 'cjs' | 'iife';
  target: string;
  minify: boolean;
  sourcemap: boolean;
}

export interface BuildResult {
  errors: PluginError[];
  warnings: PluginWarning[];
  outputFiles: OutputFile[];
  metafile?: Metafile;
}

export interface OutputFile {
  path: string;
  contents: Uint8Array;
  text: string;
}

export interface Metafile {
  inputs: Record<string, { bytes: number; imports: { path: string }[] }>;
  outputs: Record<string, { bytes: number; inputs: Record<string, { bytesInOutput: number }> }>;
}

export interface PluginError {
  text: string;
  location?: Location;
  notes?: Note[];
  detail?: any;
}

export interface PluginWarning {
  text: string;
  location?: Location;
  notes?: Note[];
  detail?: any;
}

export interface Location {
  file: string;
  line: number;
  column: number;
  length?: number;
  lineText?: string;
}

export interface Note {
  text: string;
  location?: Location;
}

// Plugin interface
export interface Plugin {
  name: string;
  setup: (build: PluginBuild) => void | Promise<void>;
}

// Plugin build context
export interface PluginBuild {
  onStart: (callback: OnStartCallback) => void;
  onEnd: (callback: OnEndCallback) => void;
  onResolve: (options: { filter: RegExp; namespace?: string }, callback: OnResolveCallback) => void;
  onLoad: (options: { filter: RegExp; namespace?: string }, callback: OnLoadCallback) => void;
  onTransform: (options: { filter: RegExp }, callback: OnTransformCallback) => void;
  onBundle: (callback: OnBundleCallback) => void;
  resolve: (path: string, options?: { resolveDir?: string; kind?: string }) => Promise<OnResolveResult>;
  initialOptions: BuildOptions;
}

// Hook registration
interface RegisteredHook<T> {
  filter: RegExp;
  namespace?: string;
  callback: T;
  pluginName: string;
}

/**
 * Plugin manager
 */
export class PluginManager {
  private plugins: Plugin[] = [];
  private onStartCallbacks: Array<{ callback: OnStartCallback; pluginName: string }> = [];
  private onEndCallbacks: Array<{ callback: OnEndCallback; pluginName: string }> = [];
  private onResolveHooks: RegisteredHook<OnResolveCallback>[] = [];
  private onLoadHooks: RegisteredHook<OnLoadCallback>[] = [];
  private onTransformHooks: RegisteredHook<OnTransformCallback>[] = [];
  private onBundleCallbacks: Array<{ callback: OnBundleCallback; pluginName: string }> = [];
  private buildOptions: BuildOptions;

  constructor(options: BuildOptions) {
    this.buildOptions = options;
  }

  /**
   * Register a plugin
   */
  async register(plugin: Plugin): Promise<void> {
    this.plugins.push(plugin);

    const build: PluginBuild = {
      onStart: (callback) => {
        this.onStartCallbacks.push({ callback, pluginName: plugin.name });
      },
      onEnd: (callback) => {
        this.onEndCallbacks.push({ callback, pluginName: plugin.name });
      },
      onResolve: (options, callback) => {
        this.onResolveHooks.push({
          filter: options.filter,
          namespace: options.namespace,
          callback,
          pluginName: plugin.name,
        });
      },
      onLoad: (options, callback) => {
        this.onLoadHooks.push({
          filter: options.filter,
          namespace: options.namespace,
          callback,
          pluginName: plugin.name,
        });
      },
      onTransform: (options, callback) => {
        this.onTransformHooks.push({
          filter: options.filter,
          callback,
          pluginName: plugin.name,
        });
      },
      onBundle: (callback) => {
        this.onBundleCallbacks.push({ callback, pluginName: plugin.name });
      },
      resolve: async (importPath, options) => {
        return this.runOnResolve({
          path: importPath,
          importer: '',
          namespace: 'file',
          kind: (options?.kind as any) || 'import',
          resolveDir: options?.resolveDir || process.cwd(),
        });
      },
      initialOptions: this.buildOptions,
    };

    await plugin.setup(build);
  }

  /**
   * Run onStart hooks
   */
  async runOnStart(): Promise<void> {
    for (const { callback, pluginName } of this.onStartCallbacks) {
      try {
        await callback({ initialOptions: this.buildOptions });
      } catch (error) {
        console.error(`Plugin ${pluginName} onStart error:`, error);
      }
    }
  }

  /**
   * Run onEnd hooks
   */
  async runOnEnd(result: BuildResult): Promise<void> {
    for (const { callback, pluginName } of this.onEndCallbacks) {
      try {
        await callback({ result });
      } catch (error) {
        console.error(`Plugin ${pluginName} onEnd error:`, error);
      }
    }
  }

  /**
   * Run onResolve hooks
   */
  async runOnResolve(args: OnResolveArgs): Promise<OnResolveResult> {
    for (const hook of this.onResolveHooks) {
      // Check namespace
      if (hook.namespace && hook.namespace !== args.namespace) {
        continue;
      }

      // Check filter
      if (!hook.filter.test(args.path)) {
        continue;
      }

      try {
        const result = await hook.callback(args);
        if (result) {
          return result;
        }
      } catch (error) {
        console.error(`Plugin ${hook.pluginName} onResolve error:`, error);
      }
    }

    // Default resolution
    return { path: args.path };
  }

  /**
   * Run onLoad hooks
   */
  async runOnLoad(args: OnLoadArgs): Promise<OnLoadResult | null> {
    for (const hook of this.onLoadHooks) {
      // Check namespace
      if (hook.namespace && hook.namespace !== args.namespace) {
        continue;
      }

      // Check filter
      if (!hook.filter.test(args.path)) {
        continue;
      }

      try {
        const result = await hook.callback(args);
        if (result) {
          return result;
        }
      } catch (error) {
        console.error(`Plugin ${hook.pluginName} onLoad error:`, error);
      }
    }

    return null;
  }

  /**
   * Run onTransform hooks
   */
  async runOnTransform(args: OnTransformArgs): Promise<OnTransformResult> {
    let contents = args.contents;
    let map: string | undefined;

    for (const hook of this.onTransformHooks) {
      if (!hook.filter.test(args.path)) {
        continue;
      }

      try {
        const result = await hook.callback({ ...args, contents });
        if (result?.contents) {
          contents = result.contents;
          if (result.map) {
            map = result.map;
          }
        }
      } catch (error) {
        console.error(`Plugin ${hook.pluginName} onTransform error:`, error);
      }
    }

    return { contents, map };
  }

  /**
   * Run onBundle hooks
   */
  async runOnBundle(args: OnBundleArgs): Promise<BundleChunk[]> {
    let chunks = args.chunks;

    for (const { callback, pluginName } of this.onBundleCallbacks) {
      try {
        const result = await callback({ ...args, chunks });
        if (result?.chunks) {
          chunks = result.chunks;
        }
      } catch (error) {
        console.error(`Plugin ${pluginName} onBundle error:`, error);
      }
    }

    return chunks;
  }
}

// ============================================
// Built-in plugins
// ============================================

/**
 * JSON plugin - import JSON files
 */
export function jsonPlugin(): Plugin {
  return {
    name: 'json',
    setup(build) {
      build.onLoad({ filter: /\.json$/ }, async (args) => {
        const contents = fs.readFileSync(args.path, 'utf-8');
        return {
          contents: `export default ${contents};`,
          loader: 'js',
        };
      });
    },
  };
}

/**
 * CSS plugin - import CSS files
 */
export function cssPlugin(): Plugin {
  return {
    name: 'css',
    setup(build) {
      build.onLoad({ filter: /\.css$/ }, async (args) => {
        const css = fs.readFileSync(args.path, 'utf-8');
        
        // Inject CSS into document
        const js = `
          const css = ${JSON.stringify(css)};
          if (typeof document !== 'undefined') {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
          }
          export default css;
        `;

        return {
          contents: js,
          loader: 'js',
        };
      });
    },
  };
}

/**
 * Raw plugin - import files as text
 */
export function rawPlugin(options: { filter?: RegExp } = {}): Plugin {
  return {
    name: 'raw',
    setup(build) {
      const filter = options.filter || /\?raw$/;
      
      build.onResolve({ filter }, (args) => {
        return {
          path: args.path.replace(/\?raw$/, ''),
          namespace: 'raw',
        };
      });

      build.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => {
        const contents = fs.readFileSync(args.path, 'utf-8');
        return {
          contents: `export default ${JSON.stringify(contents)};`,
          loader: 'js',
        };
      });
    },
  };
}

/**
 * Env plugin - replace process.env
 */
export function envPlugin(env: Record<string, string> = process.env as Record<string, string>): Plugin {
  return {
    name: 'env',
    setup(build) {
      build.onTransform({ filter: /\.(js|ts|jsx|tsx)$/ }, async (args) => {
        let contents = args.contents;

        // Replace process.env.VAR
        for (const [key, value] of Object.entries(env)) {
          const regex = new RegExp(`process\\.env\\.${key}`, 'g');
          contents = contents.replace(regex, JSON.stringify(value || ''));
        }

        // Replace import.meta.env
        contents = contents.replace(
          /import\.meta\.env/g,
          JSON.stringify(env)
        );

        return { contents };
      });
    },
  };
}

/**
 * Alias plugin - path aliases
 */
export function aliasPlugin(aliases: Record<string, string>): Plugin {
  return {
    name: 'alias',
    setup(build) {
      for (const [alias, target] of Object.entries(aliases)) {
        const filter = new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)`);
        
        build.onResolve({ filter }, (args) => {
          const newPath = args.path.replace(alias, target);
          return { path: path.resolve(args.resolveDir, newPath) };
        });
      }
    },
  };
}

/**
 * External plugin - mark packages as external
 */
export function externalPlugin(externals: string[]): Plugin {
  return {
    name: 'external',
    setup(build) {
      const filter = new RegExp(`^(${externals.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(/|$)`);
      
      build.onResolve({ filter }, (args) => {
        return { path: args.path, external: true };
      });
    },
  };
}

/**
 * Virtual plugin - virtual modules
 */
export function virtualPlugin(modules: Record<string, string>): Plugin {
  return {
    name: 'virtual',
    setup(build) {
      const filter = new RegExp(`^(${Object.keys(modules).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`);
      
      build.onResolve({ filter }, (args) => {
        return { path: args.path, namespace: 'virtual' };
      });

      build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
        const contents = modules[args.path];
        if (contents) {
          return { contents, loader: 'js' };
        }
        return null;
      });
    },
  };
}

// All types already exported above
