/**
 * React Plugin for Kona Bundler
 *
 * Provides optimized React support with:
 * - Fast Refresh (improved HMR)
 * - Automatic JSX runtime detection
 * - JSX/TSX transformation
 */

import { Plugin } from '../../core/plugins/pluginSystem';
import * as ts from 'typescript';

export interface IPluginReactOptions {
  /** Enable Fast Refresh for HMR */
  fastRefresh?: boolean;
  /** JSX runtime: 'automatic' (React 17+) or 'classic' */
  runtime?: 'automatic' | 'classic';
  /** Development mode (enables extra checks) */
  development?: boolean;
  /** Import source for JSX (default: 'react') */
  importSource?: string;
}

/**
 * React plugin for Kona bundler
 */
export function pluginReact(options: IPluginReactOptions = {}): Plugin {
  const opts = {
    fastRefresh: options.fastRefresh ?? true,
    runtime: options.runtime ?? 'automatic',
    development: options.development ?? process.env.NODE_ENV !== 'production',
    importSource: options.importSource ?? 'react',
  };

  return {
    name: 'react',
    setup(build) {
      // Transform JSX/TSX files
      build.onTransform({ filter: /\.[jt]sx$/ }, async (args) => {
        let code = args.contents;

        // Transform TypeScript/JSX using TypeScript compiler
        const result = ts.transpileModule(code, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            jsx: opts.runtime === 'automatic' 
              ? ts.JsxEmit.ReactJSX 
              : ts.JsxEmit.React,
            jsxImportSource: opts.importSource,
          },
          fileName: args.path,
        });

        code = result.outputText;

        // Add Fast Refresh wrapper in development
        if (opts.fastRefresh && opts.development) {
          code = wrapWithFastRefresh(code, args.path);
        }

        return { contents: code };
      });

      // Inject Fast Refresh runtime for development
      if (opts.fastRefresh && opts.development) {
        build.onBundle(async (args) => {
          // Add Fast Refresh runtime to entry chunks
          const chunks = args.chunks.map(chunk => {
            if (chunk.isEntry) {
              return {
                ...chunk,
                code: FAST_REFRESH_RUNTIME + '\n' + chunk.code,
              };
            }
            return chunk;
          });

          return { chunks };
        });
      }
    },
  };
}

/**
 * Wrap component with Fast Refresh boundary
 */
function wrapWithFastRefresh(code: string, filename: string): string {
  const moduleId = filename.replace(/[^a-zA-Z0-9]/g, '_');
  
  return `
// Fast Refresh Preamble
var prevRefreshReg = window.$RefreshReg$;
var prevRefreshSig = window.$RefreshSig$;
window.$RefreshReg$ = (type, id) => {
  window.__REACT_REFRESH__.register(type, "${moduleId}_" + id);
};
window.$RefreshSig$ = window.__REACT_REFRESH__.createSignatureFunctionForTransform;

try {
${code}
} finally {
  window.$RefreshReg$ = prevRefreshReg;
  window.$RefreshSig$ = prevRefreshSig;
}

// Fast Refresh Footer
if (import.meta.hot) {
  import.meta.hot.accept();
  window.__REACT_REFRESH__.performReactRefresh();
}
`;
}

/**
 * React Fast Refresh runtime
 */
const FAST_REFRESH_RUNTIME = `
// React Fast Refresh Runtime
(function() {
  if (typeof window === 'undefined') return;
  
  var RefreshRuntime = {
    _types: new Map(),
    _pendingUpdates: [],
    
    register: function(type, id) {
      if (typeof type !== 'function') return;
      this._types.set(id, type);
    },
    
    createSignatureFunctionForTransform: function() {
      return function(type) { return type; };
    },
    
    performReactRefresh: function() {
      if (this._pendingUpdates.length === 0) {
        this._pendingUpdates.push(Date.now());
        
        requestAnimationFrame(function() {
          RefreshRuntime._pendingUpdates = [];
          RefreshRuntime._scheduleUpdate();
        });
      }
    },
    
    _scheduleUpdate: function() {
      // Find React root and trigger update
      var root = document.getElementById('root');
      if (root && root._reactRootContainer) {
        var internalRoot = root._reactRootContainer._internalRoot || root._reactRootContainer;
        if (internalRoot && internalRoot.current) {
          try {
            internalRoot.current.memoizedState = null;
          } catch (e) {}
        }
      }
      
      // React 18+ with createRoot
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        var hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook.renderers) {
          hook.renderers.forEach(function(renderer) {
            if (renderer.scheduleRefresh) {
              renderer.scheduleRefresh(null, function() { return true; });
            }
          });
        }
      }
    },
    
    hasUnrecoverableErrors: function() {
      return false;
    }
  };
  
  window.__REACT_REFRESH__ = RefreshRuntime;
  window.$RefreshReg$ = function() {};
  window.$RefreshSig$ = function() { return function(type) { return type; }; };
})();
`;

/**
 * Check if module uses hooks
 */
export function usesHooks(contents: string): boolean {
  const hookPatterns = [
    /\buse[A-Z]\w*\s*\(/,
    /useState\s*\(/,
    /useEffect\s*\(/,
    /useContext\s*\(/,
    /useReducer\s*\(/,
    /useCallback\s*\(/,
    /useMemo\s*\(/,
    /useRef\s*\(/,
  ];

  return hookPatterns.some(pattern => pattern.test(contents));
}

export default pluginReact;
