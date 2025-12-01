/**
 * ESM Runtime for Kona Bundler
 *
 * Provides native ESM support including:
 * - import.meta (url, resolve)
 * - Dynamic imports
 * - Top-level await
 * - Proper ESM semantics
 */

import { ITarget } from '../config/ITarget';

export const ESM_RUNTIME_NAMES = {
  GLOBAL_OBJ: '__kona',
  MODULE_REGISTRY: 'modules',
  IMPORT_META: 'meta',
  DYNAMIC_IMPORT: 'dynamicImport',
  REQUIRE_FUNCTION: 'require',
  DEFINE_MODULE: 'define',
  EXPORTS: 'exports',
};

export interface IESMRuntimeConfig {
  /** Target environment */
  target: ITarget;
  /** Enable HMR support */
  includeHMR?: boolean;
  /** Code splitting map for dynamic imports */
  codeSplittingMap?: ICodeSplittingMap;
  /** Base URL for import.meta.url */
  baseUrl?: string;
  /** Enable source maps */
  sourceMaps?: boolean;
  /** Enable top-level await */
  topLevelAwait?: boolean;
}

export type ICodeSplittingMap = {
  bundles: Record<number, { path: string; css?: string }>;
};

/**
 * Generate import.meta polyfill for the target environment
 */
function getImportMetaPolyfill(target: ITarget, baseUrl?: string): string {
  if (target === 'browser' || target === 'electron') {
    return `
function createImportMeta(moduleId, modulePath) {
  var base = ${baseUrl ? `"${baseUrl}"` : 'document.baseURI || window.location.href'};
  var url = new URL(modulePath, base).href;
  return {
    url: url,
    resolve: function(specifier) {
      return new URL(specifier, url).href;
    },
    // Hot module replacement support
    hot: f.hmr ? f.hmr.createHotContext(moduleId) : undefined
  };
}`;
  }

  if (target === 'server') {
    return `
function createImportMeta(moduleId, modulePath) {
  var pathModule = require('path');
  var url = require('url');
  var absPath = pathModule.resolve(__dirname, modulePath);
  var fileUrl = url.pathToFileURL(absPath).href;
  return {
    url: fileUrl,
    resolve: function(specifier) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        return url.pathToFileURL(pathModule.resolve(pathModule.dirname(absPath), specifier)).href;
      }
      return specifier;
    },
    dirname: pathModule.dirname(absPath),
    filename: absPath
  };
}`;
  }

  return '';
}

/**
 * Generate dynamic import function for the target environment
 */
function getDynamicImportFunction(target: ITarget, hasCodeSplitting: boolean): string {
  if (target === 'browser' || target === 'electron') {
    return `
f.dynamicImport = function(id) {
  return new Promise(function(resolve, reject) {
    // Check if module is already loaded
    if (modules[id]) {
      return resolve(f.require(id));
    }
    ${hasCodeSplitting ? `
    // Check code splitting map
    var splitInfo = cs && cs.bundles[id];
    if (splitInfo) {
      return loadChunk(id, splitInfo).then(function() {
        resolve(f.require(id));
      }).catch(reject);
    }` : ''}
    reject(new Error('Module ' + id + ' not found for dynamic import'));
  });
};`;
  }

  if (target === 'server') {
    return `
f.dynamicImport = function(id) {
  return new Promise(function(resolve, reject) {
    try {
      if (modules[id]) {
        resolve(f.require(id));
      } else {
        ${hasCodeSplitting ? `
        var splitInfo = cs && cs.bundles[id];
        if (splitInfo) {
          require(require('path').join(__dirname, splitInfo.path));
          if (modules[id]) {
            return resolve(f.require(id));
          }
        }` : ''}
        reject(new Error('Module ' + id + ' not found'));
      }
    } catch (e) {
      reject(e);
    }
  });
};`;
  }

  return '';
}

/**
 * Generate chunk loading function for code splitting
 */
function getChunkLoader(target: ITarget): string {
  if (target === 'browser' || target === 'electron') {
    return `
function loadChunk(id, info) {
  return new Promise(function(resolve, reject) {
    if (info.loading) {
      info.callbacks.push({ resolve: resolve, reject: reject });
      return;
    }
    info.loading = true;
    info.callbacks = [{ resolve: resolve, reject: reject }];

    function onComplete() {
      info.callbacks.forEach(function(cb) { cb.resolve(); });
      info.callbacks = [];
      info.loading = false;
    }

    function onError(err) {
      info.callbacks.forEach(function(cb) { cb.reject(err); });
      info.callbacks = [];
      info.loading = false;
    }

    function loadScript() {
      var script = document.createElement('script');
      script.type = 'module';
      script.src = info.path;
      script.onload = onComplete;
      script.onerror = function() { onError(new Error('Failed to load chunk: ' + info.path)); };
      document.head.appendChild(script);
    }

    // Load CSS first if present
    if (info.css) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = info.css;
      link.onload = loadScript;
      link.onerror = function() { onError(new Error('Failed to load CSS: ' + info.css)); };
      document.head.appendChild(link);
    } else {
      loadScript();
    }
  });
}`;
  }

  return '';
}

/**
 * Generate top-level await support wrapper
 */
function getTopLevelAwaitSupport(): string {
  return `
// Top-level await support
f.tla = {
  pending: new Map(),
  resolved: new Set(),
  
  // Mark module as having TLA
  mark: function(id) {
    if (!this.pending.has(id)) {
      this.pending.set(id, { promise: null, resolve: null });
    }
  },
  
  // Wait for TLA to complete
  wait: function(id) {
    var entry = this.pending.get(id);
    if (!entry) return Promise.resolve();
    if (this.resolved.has(id)) return Promise.resolve();
    if (!entry.promise) {
      entry.promise = new Promise(function(resolve) {
        entry.resolve = resolve;
      });
    }
    return entry.promise;
  },
  
  // Signal TLA completion
  complete: function(id) {
    var entry = this.pending.get(id);
    if (entry && entry.resolve) {
      entry.resolve();
    }
    this.resolved.add(id);
  }
};`;
}

/**
 * Generate the ESM interop helpers
 */
function getESMInteropHelpers(): string {
  return `
// ESM interop helpers
f.esm = function(exports) {
  Object.defineProperty(exports, '__esModule', { value: true });
  return exports;
};

f.exportAll = function(source, target) {
  Object.keys(source).forEach(function(key) {
    if (key !== 'default' && key !== '__esModule') {
      Object.defineProperty(target, key, {
        enumerable: true,
        get: function() { return source[key]; }
      });
    }
  });
  return target;
};

f.exportDefault = function(exports, value) {
  Object.defineProperty(exports, 'default', {
    enumerable: true,
    value: value
  });
  return exports;
};

f.interopDefault = function(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
};

f.interopNamespace = function(mod) {
  if (mod && mod.__esModule) return mod;
  var ns = Object.create(null);
  if (mod) {
    Object.keys(mod).forEach(function(key) {
      ns[key] = mod[key];
    });
  }
  ns.default = mod;
  Object.defineProperty(ns, '__esModule', { value: true });
  return ns;
};`;
}

/**
 * Generate the complete ESM runtime
 */
export function generateESMRuntime(config: IESMRuntimeConfig): string {
  const { target, includeHMR, codeSplittingMap, baseUrl, topLevelAwait } = config;
  const hasCodeSplitting = !!codeSplittingMap;

  // Global variable initialization
  let globalInit: string;
  if (target === 'browser' || target === 'electron') {
    globalInit = `var f = window.${ESM_RUNTIME_NAMES.GLOBAL_OBJ} = window.${ESM_RUNTIME_NAMES.GLOBAL_OBJ} || {};`;
  } else if (target === 'server') {
    globalInit = `var f = global.${ESM_RUNTIME_NAMES.GLOBAL_OBJ} = global.${ESM_RUNTIME_NAMES.GLOBAL_OBJ} || {};`;
  } else {
    globalInit = `var f = {};`;
  }

  let runtime = `(function() {
  "use strict";
  ${globalInit}
  var modules = f.modules = f.modules || {};
  var cache = f.cache = f.cache || {};
  ${hasCodeSplitting ? `var cs = ${JSON.stringify(codeSplittingMap)};` : ''}

  // Module definition
  f.define = function(id, deps, factory) {
    modules[id] = { deps: deps, factory: factory, exports: null };
  };

  // Module require with ESM semantics
  f.require = function(id) {
    var cached = cache[id];
    if (cached) return cached.exports;

    var mod = modules[id];
    if (!mod) {
      ${hasCodeSplitting ? 'var splitInfo = cs && cs.bundles[id]; if (splitInfo) throw new Error("Module " + id + " requires dynamic import");' : ''}
      throw new Error('Module ' + id + ' not found');
    }

    // Create module context
    var moduleExports = {};
    var moduleObj = { exports: moduleExports, id: id };
    cache[id] = moduleObj;

    // Execute module factory
    if (typeof mod === 'function') {
      // Legacy format
      mod(f.require, moduleExports, moduleObj);
    } else if (mod.factory) {
      // ESM format with dependencies
      var depExports = mod.deps.map(function(depId) {
        return f.require(depId);
      });
      mod.factory.apply(null, [f.require, moduleExports, moduleObj].concat(depExports));
    }

    return moduleObj.exports;
  };

  // Bundle registration (legacy compatibility)
  f.bundle = function(collection, callback) {
    for (var id in collection) {
      modules[id] = collection[id];
    }
    if (callback) callback();
  };

${getImportMetaPolyfill(target, baseUrl)}

${getDynamicImportFunction(target, hasCodeSplitting)}

${hasCodeSplitting ? getChunkLoader(target) : ''}

${topLevelAwait ? getTopLevelAwaitSupport() : ''}

${getESMInteropHelpers()}

${includeHMR ? '  f.modules = modules;' : ''}
})();`;

  return runtime;
}

/**
 * Generate module wrapper for ESM output
 */
export function wrapESMModule(
  moduleId: number,
  code: string,
  modulePath: string,
  options: {
    hasTopLevelAwait?: boolean;
    dependencies?: number[];
  } = {}
): string {
  const { hasTopLevelAwait, dependencies = [] } = options;
  const depsArray = JSON.stringify(dependencies);

  if (hasTopLevelAwait) {
    return `__kona.define(${moduleId}, ${depsArray}, async function(__require, exports, module) {
  var import_meta = __kona.meta ? __kona.meta(${moduleId}, "${modulePath}") : {};
  __kona.tla.mark(${moduleId});
  try {
${code}
  } finally {
    __kona.tla.complete(${moduleId});
  }
});`;
  }

  return `__kona.define(${moduleId}, ${depsArray}, function(__require, exports, module) {
  var import_meta = __kona.meta ? __kona.meta(${moduleId}, "${modulePath}") : {};
${code}
});`;
}

/**
 * Check if code contains top-level await
 */
export function hasTopLevelAwait(code: string): boolean {
  // Simple heuristic - look for await outside of async functions
  // This is a simplified check; a proper implementation would use AST analysis
  const awaitRegex = /\bawait\s+/g;

  // Remove async functions to check for TLA
  let stripped = code;
  let depth = 0;
  let inAsync = false;
  let result = '';
  let i = 0;

  while (i < stripped.length) {
    if (stripped.slice(i).match(/^async\s+(function|\()/)) {
      inAsync = true;
    }
    if (stripped[i] === '{' && inAsync) {
      depth++;
    }
    if (stripped[i] === '}' && inAsync) {
      depth--;
      if (depth === 0) {
        inAsync = false;
      }
    }
    if (!inAsync) {
      result += stripped[i];
    }
    i++;
  }

  return awaitRegex.test(result);
}
