/**
 * Enhanced HMR (Hot Module Replacement) for Kona Bundler
 *
 * Improvements over standard HMR:
 * - Faster update propagation
 * - Better error recovery
 * - State preservation
 * - CSS hot reload without full refresh
 * - React Fast Refresh integration
 * - Partial bundle updates
 *
 * @example
 * ```ts
 * fusebox({
 *   hmr: {
 *     enabled: true,
 *     enhanced: true,
 *     preserveState: true,
 *     overlay: true,
 *   }
 * })
 * ```
 */

import * as convertSourceMap from 'convert-source-map';
import * as offsetLinesModule from 'offset-sourcemap-lines';
import { BUNDLE_RUNTIME_NAMES } from '../bundleRuntime/bundleRuntimeCore';
import { Context } from '../core/context';
import { IBundleContext } from '../moduleResolver/bundleContext';
import { IModule } from '../moduleResolver/module';
import { IHMRModulesUpdate } from '../types/hmr';
import { Concat, fastHash } from '../utils/utils';

export interface IEnhancedHMRConfig {
  /** Enable enhanced HMR features */
  enhanced?: boolean;
  /** Preserve component state during updates */
  preserveState?: boolean;
  /** Show error overlay */
  overlay?: boolean;
  /** Timeout for update acknowledgment (ms) */
  timeout?: number;
  /** Enable partial updates (only changed modules) */
  partialUpdates?: boolean;
  /** CSS hot reload without JS */
  cssHotReload?: boolean;
  /** React Fast Refresh integration */
  reactFastRefresh?: boolean;
  /** Custom accept handlers */
  acceptHandlers?: Record<string, (module: any) => void>;
}

const DEFAULT_CONFIG: IEnhancedHMRConfig = {
  enhanced: true,
  preserveState: true,
  overlay: true,
  timeout: 5000,
  partialUpdates: true,
  cssHotReload: true,
  reactFastRefresh: true,
};

/**
 * Generate unique update ID
 */
function generateUpdateId(): string {
  return fastHash(Date.now().toString() + Math.random().toString());
}

/**
 * Generate module dependency tree
 */
function generateDependencyTree(bundleContext: IBundleContext): Record<number, {
  deps: number[];
  path: string;
  isCSS: boolean;
  isReact: boolean;
}> {
  const tree: Record<number, any> = {};

  for (const absPath in bundleContext.modules) {
    const module = bundleContext.modules[absPath];
    if (!module) continue;

    tree[module.id] = {
      deps: module.dependencies || [],
      path: module.publicPath || absPath,
      isCSS: module.isStylesheet || absPath.endsWith('.css'),
      isReact: isReactModule(module),
    };
  }

  return tree;
}

/**
 * Check if module is a React component
 */
function isReactModule(module: IModule): boolean {
  if (!module.contents) return false;

  const reactPatterns = [
    /import\s+.*from\s+['"]react['"]/,
    /require\s*\(\s*['"]react['"]\)/,
    /React\.createElement/,
    /jsx\(/,
    /<[A-Z]/,
  ];

  return reactPatterns.some(p => p.test(module.contents));
}

/**
 * Find affected modules (modules that depend on changed modules)
 */
function findAffectedModules(
  changedIds: number[],
  tree: Record<number, { deps: number[] }>
): Set<number> {
  const affected = new Set<number>(changedIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const id in tree) {
      const numId = parseInt(id);
      if (affected.has(numId)) continue;

      const deps = tree[id].deps;
      if (deps.some(dep => affected.has(dep))) {
        affected.add(numId);
        changed = true;
      }
    }
  }

  return affected;
}

/**
 * Generate HMR update for modules
 */
function generateModuleUpdates(modules: IModule[]): IHMRModulesUpdate {
  const DEFINE_MODULE = BUNDLE_RUNTIME_NAMES.GLOBAL_OBJ + '.' + BUNDLE_RUNTIME_NAMES.MODULE_COLLECTION;
  const updates: IHMRModulesUpdate = [];

  for (const module of modules) {
    const concat = new Concat(true, '', '\n');

    // Module wrapper
    const opening = `${DEFINE_MODULE}[${module.id}] = function(${BUNDLE_RUNTIME_NAMES.ARG_REQUIRE_FUNCTION}, exports, module){`;

    concat.add(null, opening);
    concat.add(null, '// HMR module start');
    concat.add(null, module.contents, module.isSourceMapRequired ? module.sourceMap : undefined);
    concat.add(null, '// HMR module end');
    concat.add(null, '}');

    let content = concat.content.toString();

    // Add source maps
    if (module.isSourceMapRequired && concat.sourceMap) {
      try {
        let json = JSON.parse(concat.sourceMap);
        json = offsetLinesModule(json, 2);
        const sm = convertSourceMap.fromObject(json).toComment();
        content += '\n' + sm;
      } catch {
        // Ignore source map errors
      }
    }

    updates.push({
      id: module.id,
      path: module.publicPath || module.absPath,
      content,
    });
  }

  return updates;
}

/**
 * Generate CSS-only update (no JS execution needed)
 */
function generateCSSUpdate(module: IModule): { id: number; css: string; path: string } {
  return {
    id: module.id,
    css: module.contents || '',
    path: module.publicPath || module.absPath,
  };
}

/**
 * Generate error overlay HTML
 */
export function generateErrorOverlay(error: Error): string {
  const stack = error.stack || error.message;

  return `
(function() {
  if (typeof document === 'undefined') return;

  var overlay = document.getElementById('kona-error-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'kona-error-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);color:#ff5555;font-family:monospace;padding:20px;z-index:999999;overflow:auto;';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = '<div style="max-width:800px;margin:0 auto;">' +
    '<h2 style="color:#ff5555;margin:0 0 20px;">Build Error</h2>' +
    '<pre style="white-space:pre-wrap;word-break:break-word;background:#1a1a1a;padding:15px;border-radius:5px;">' +
    ${JSON.stringify(stack)} +
    '</pre>' +
    '<button onclick="this.parentElement.parentElement.remove()" style="margin-top:20px;padding:10px 20px;background:#ff5555;color:white;border:none;cursor:pointer;border-radius:5px;">Dismiss</button>' +
    '</div>';
})();
`;
}

/**
 * Generate success notification
 */
export function generateSuccessNotification(count: number): string {
  return `
(function() {
  if (typeof document === 'undefined') return;

  // Remove error overlay if exists
  var overlay = document.getElementById('kona-error-overlay');
  if (overlay) overlay.remove();

  // Show toast notification
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#10b981;color:white;padding:12px 20px;border-radius:8px;font-family:system-ui;font-size:14px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
  toast.textContent = '✓ Updated ${count} module${count !== 1 ? 's' : ''}';
  document.body.appendChild(toast);

  setTimeout(function() {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(function() { toast.remove(); }, 300);
  }, 2000);
})();
`;
}

/**
 * Enhanced HMR client runtime
 */
export function generateEnhancedHMRRuntime(config: IEnhancedHMRConfig): string {
  return `// Kona Enhanced HMR Runtime
(function() {
  if (typeof window === 'undefined') return;

  var __kona_hmr = window.__kona_hmr = window.__kona_hmr || {
    config: ${JSON.stringify(config)},
    moduleStates: new Map(),
    acceptHandlers: new Map(),
    disposeHandlers: new Map(),

    // Save module state before update
    saveState: function(moduleId) {
      if (!this.config.preserveState) return;
      var mod = __fuse.c[moduleId];
      if (mod && mod.m && mod.m.exports) {
        // Try to extract state from React components
        var exports = mod.m.exports;
        if (exports.default && exports.default.__kona_state) {
          this.moduleStates.set(moduleId, exports.default.__kona_state);
        }
      }
    },

    // Restore module state after update
    restoreState: function(moduleId) {
      if (!this.config.preserveState) return;
      var state = this.moduleStates.get(moduleId);
      if (state) {
        var mod = __fuse.c[moduleId];
        if (mod && mod.m && mod.m.exports && mod.m.exports.default) {
          mod.m.exports.default.__kona_state = state;
        }
        this.moduleStates.delete(moduleId);
      }
    },

    // Register accept handler
    accept: function(moduleId, handler) {
      this.acceptHandlers.set(moduleId, handler);
    },

    // Register dispose handler
    dispose: function(moduleId, handler) {
      this.disposeHandlers.set(moduleId, handler);
    },

    // Apply module update
    applyUpdate: function(update) {
      var moduleId = update.id;

      // Run dispose handler
      var disposeHandler = this.disposeHandlers.get(moduleId);
      if (disposeHandler) {
        try { disposeHandler(); } catch(e) { console.warn('HMR dispose error:', e); }
      }

      // Save state
      this.saveState(moduleId);

      // Clear cache
      delete __fuse.c[moduleId];

      // Execute new module code
      try {
        eval(update.content);
      } catch(e) {
        console.error('HMR update failed:', e);
        ${config.overlay ? 'this.showError(e);' : ''}
        return false;
      }

      // Restore state
      this.restoreState(moduleId);

      // Run accept handler
      var acceptHandler = this.acceptHandlers.get(moduleId);
      if (acceptHandler) {
        try { acceptHandler(__fuse.r(moduleId)); } catch(e) { console.warn('HMR accept error:', e); }
      }

      return true;
    },

    // Apply CSS update (no JS execution)
    applyCSSUpdate: function(update) {
      var styleId = 'kona-css-' + update.id;
      var existing = document.getElementById(styleId);

      if (existing) {
        existing.textContent = update.css;
      } else {
        var style = document.createElement('style');
        style.id = styleId;
        style.textContent = update.css;
        document.head.appendChild(style);
      }

      return true;
    },

    // Show error overlay
    showError: function(error) {
      ${config.overlay ? `
      var overlay = document.getElementById('kona-error-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'kona-error-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);color:#ff5555;font-family:monospace;padding:20px;z-index:999999;overflow:auto;';
        document.body.appendChild(overlay);
      }
      overlay.innerHTML = '<div style="max-width:800px;margin:0 auto;"><h2 style="color:#ff5555;">HMR Error</h2><pre style="white-space:pre-wrap;">' + (error.stack || error.message) + '</pre><button onclick="this.parentElement.parentElement.remove()" style="margin-top:20px;padding:10px 20px;background:#ff5555;color:white;border:none;cursor:pointer;">Dismiss</button></div>';
      ` : ''}
    },

    // Clear error overlay
    clearError: function() {
      var overlay = document.getElementById('kona-error-overlay');
      if (overlay) overlay.remove();
    },

    // React Fast Refresh integration
    performReactRefresh: function() {
      if (!this.config.reactFastRefresh) return;
      if (typeof window.$RefreshRuntime$ !== 'undefined') {
        window.$RefreshRuntime$.performReactRefresh();
      }
    }
  };

  // Export HMR API
  if (typeof module !== 'undefined' && module.hot === undefined) {
    module.hot = {
      accept: function(handler) { __kona_hmr.accept(module.id, handler); },
      dispose: function(handler) { __kona_hmr.dispose(module.id, handler); },
      data: {}
    };
  }
})();
`;
}

/**
 * Create enhanced HMR handler
 */
export function createEnhancedHMR(ctx: Context, config: IEnhancedHMRConfig = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const { ict } = ctx;

  if (!ctx.config.devServer?.enabled) return;

  const devServer = ctx.devServer;
  const pendingUpdates: Map<string, boolean> = new Map();

  // Inject enhanced HMR runtime
  ict.on('before_bundle_write', props => {
    if (!mergedConfig.enhanced) return props;

    const { bundle } = props;
    bundle.source.injectionBeforeBundleExec.push(
      generateEnhancedHMRRuntime(mergedConfig)
    );

    return props;
  });

  // Handle rebundle
  ict.on('rebundle', () => {
    const updateId = generateUpdateId();
    pendingUpdates.set(updateId, true);
    devServer.clientSend('hmr-request', { id: updateId });
  });

  // Send updates to client
  function sendUpdates(payload: { id: string; modules: number[] }, wsInstance?: WebSocket) {
    const moduleIds = payload.modules;
    const modulesForUpdate: IModule[] = [];
    const cssUpdates: Array<{ id: number; css: string; path: string }> = [];

    const bundleContext = ctx.bundleContext;
    const tree = generateDependencyTree(bundleContext);

    for (const absPath in bundleContext.modules) {
      const module = bundleContext.modules[absPath];
      if (!module) continue;

      // Check if module needs update
      if (!moduleIds.includes(module.id) || !module.isCached) {
        // Handle CSS separately for hot reload
        if (mergedConfig.cssHotReload && module.isStylesheet) {
          cssUpdates.push(generateCSSUpdate(module));
        } else {
          modulesForUpdate.push(module);
        }
      }
    }

    // Find affected modules if partial updates enabled
    let affectedIds: number[] = modulesForUpdate.map(m => m.id);
    if (mergedConfig.partialUpdates) {
      const affected = findAffectedModules(affectedIds, tree);
      affectedIds = Array.from(affected);
    }

    // Generate updates
    const jsUpdates = generateModuleUpdates(modulesForUpdate);

    // Send to client
    devServer.clientSend('hmr-update', {
      id: payload.id,
      tree,
      jsUpdates,
      cssUpdates,
      affectedIds,
      timestamp: Date.now(),
    }, wsInstance);

    const totalCount = jsUpdates.length + cssUpdates.length;
    ctx.log.info('hmr', `Sending ${totalCount} updates (${jsUpdates.length} JS, ${cssUpdates.length} CSS)`);
  }

  // Listen for client messages
  devServer.onClientMessage((event, payload: any, wsInstance?: WebSocket) => {
    if (event === 'hmr-summary' && payload.id && pendingUpdates.has(payload.id)) {
      sendUpdates(payload, wsInstance);
      pendingUpdates.delete(payload.id);
    }

    if (event === 'hmr-error') {
      ctx.log.warn(`HMR error from client: ${payload.message}`);
    }

    if (event === 'hmr-success') {
      ctx.log.info('hmr', 'Update applied successfully');
    }
  });
}

export default createEnhancedHMR;
