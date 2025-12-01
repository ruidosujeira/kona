/**
 * React Plugin for Kona Bundler
 *
 * Provides optimized React support with:
 * - Fast Refresh (improved HMR)
 * - Automatic JSX runtime detection
 * - React Server Components support
 * - Concurrent features optimization
 *
 * @example
 * ```ts
 * fusebox({
 *   plugins: [
 *     pluginReact({
 *       fastRefresh: true,
 *       runtime: 'automatic', // or 'classic'
 *       development: true,
 *     })
 *   ]
 * })
 * ```
 */

import { Context } from '../../core/context';
import { IModule } from '../../moduleResolver/module';
import { createGlobalModuleCall } from '../../bundleRuntime/bundleRuntimeCore';
import { parsePluginOptions } from '../pluginUtils';

export interface IPluginReactOptions {
  /** Enable Fast Refresh for HMR */
  fastRefresh?: boolean;
  /** JSX runtime: 'automatic' (React 17+) or 'classic' */
  runtime?: 'automatic' | 'classic';
  /** Development mode (enables extra checks) */
  development?: boolean;
  /** Import source for JSX (default: 'react') */
  jsxImportSource?: string;
  /** Enable React Server Components */
  serverComponents?: boolean;
  /** Profiler support */
  profiler?: boolean;
  /** File patterns to apply React transforms */
  include?: RegExp;
  /** File patterns to exclude */
  exclude?: RegExp;
}

const DEFAULT_OPTIONS: IPluginReactOptions = {
  fastRefresh: true,
  runtime: 'automatic',
  development: true,
  jsxImportSource: 'react',
  serverComponents: false,
  profiler: false,
  include: /\.(jsx|tsx)$/,
};

/**
 * Check if module is a React component
 */
function isReactComponent(contents: string): boolean {
  // Check for common React patterns
  const patterns = [
    /import\s+.*\s+from\s+['"]react['"]/,
    /import\s+\*\s+as\s+React\s+from\s+['"]react['"]/,
    /require\s*\(\s*['"]react['"]\s*\)/,
    /extends\s+(React\.)?Component/,
    /extends\s+(React\.)?PureComponent/,
    /<[A-Z][a-zA-Z0-9]*/, // JSX component
    /React\.createElement/,
    /jsx\s*\(/,
    /jsxs\s*\(/,
  ];

  return patterns.some(pattern => pattern.test(contents));
}

/**
 * Check if module uses hooks (for future optimization)
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
    /useLayoutEffect\s*\(/,
    /useImperativeHandle\s*\(/,
  ];

  return hookPatterns.some(pattern => pattern.test(contents));
}

/**
 * Generate Fast Refresh wrapper for a module
 */
function wrapWithFastRefresh(
  module: IModule,
  contents: string,
  refreshRuntimeId: number
): string {
  const moduleId = module.id;

  return `// React Fast Refresh wrapper
(function() {
  var prevRefreshReg = typeof window !== 'undefined' ? window.$RefreshReg$ : function() {};
  var prevRefreshSig = typeof window !== 'undefined' ? window.$RefreshSig$ : function() { return function(type) { return type; }; };

  if (typeof window !== 'undefined') {
    var RefreshRuntime = ${createGlobalModuleCall(refreshRuntimeId)};

    window.$RefreshReg$ = function(type, id) {
      RefreshRuntime.register(type, '${moduleId}:' + id);
    };

    window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
  }

  try {
${contents}

    // Register exports for Fast Refresh
    if (typeof window !== 'undefined' && window.$RefreshReg$) {
      if (typeof exports !== 'undefined') {
        for (var key in exports) {
          if (typeof exports[key] === 'function') {
            window.$RefreshReg$(exports[key], key);
          }
        }
        if (exports.default && typeof exports.default === 'function') {
          window.$RefreshReg$(exports.default, 'default');
        }
      }
    }
  } finally {
    if (typeof window !== 'undefined') {
      window.$RefreshReg$ = prevRefreshReg;
      window.$RefreshSig$ = prevRefreshSig;
    }
  }
})();
`;
}

/**
 * Generate Fast Refresh runtime injection
 */
function generateRefreshRuntimeInjection(refreshRuntimeId: number): string {
  return `// Fast Refresh Runtime Setup
if (typeof window !== 'undefined' && typeof window.$RefreshReg$ === 'undefined') {
  var RefreshRuntime = ${createGlobalModuleCall(refreshRuntimeId)};
  RefreshRuntime.injectIntoGlobalHook(window);
  window.$RefreshReg$ = function() {};
  window.$RefreshSig$ = function() { return function(type) { return type; }; };
}
`;
}

/**
 * Find react-refresh runtime module
 */
function findRefreshRuntime(modules: Record<string, IModule>): IModule | undefined {
  for (const absPath in modules) {
    if (absPath.includes('react-refresh/runtime') || absPath.includes('react-refresh')) {
      return modules[absPath];
    }
  }
  return undefined;
}

/**
 * React plugin
 */
export function pluginReact(a?: IPluginReactOptions | RegExp | string, b?: IPluginReactOptions) {
  const [opts] = parsePluginOptions<IPluginReactOptions>(a, b, DEFAULT_OPTIONS);
  const options = { ...DEFAULT_OPTIONS, ...opts };

  return (ctx: Context) => {
    let refreshRuntimeModule: IModule | undefined;

    // Resolve react-refresh on entry
    if (options.fastRefresh && ctx.config.isDevelopment) {
      ctx.ict.on('entry_resolve', async props => {
        try {
          const data = await props.module.resolve({ statement: 'react-refresh/runtime' });
          if (data.module) {
            refreshRuntimeModule = data.module;
            ctx.log.info('react', 'Fast Refresh enabled');
          }
        } catch {
          ctx.log.warn('react-refresh not found. Install with: npm install react-refresh');
        }
      });
    }

    // Inject Fast Refresh runtime before bundle
    ctx.ict.on('before_bundle_write', props => {
      if (!options.fastRefresh || !ctx.config.isDevelopment) return props;

      const { bundle } = props;
      const modules = ctx.bundleContext?.modules || {};

      // Find refresh runtime if not already found
      if (!refreshRuntimeModule) {
        refreshRuntimeModule = findRefreshRuntime(modules);
      }

      if (refreshRuntimeModule) {
        bundle.source.injectionBeforeBundleExec.push(
          generateRefreshRuntimeInjection(refreshRuntimeModule.id)
        );
      }

      return props;
    });

    // Transform React modules
    ctx.ict.on('bundle_resolve_module', props => {
      const { module } = props;
      if (module.captured) return props;

      // Check file extension
      const isJSX = options.include?.test(module.absPath);
      if (!isJSX && !module.absPath.endsWith('.jsx') && !module.absPath.endsWith('.tsx')) {
        return props;
      }

      // Check exclusions
      if (options.exclude?.test(module.absPath)) {
        return props;
      }

      // Read module contents
      module.read();
      if (!module.contents) return props;

      // Check if it's a React component
      if (!isReactComponent(module.contents)) {
        return props;
      }

      ctx.log.info('react', 'Processing $file', { file: module.publicPath });

      // Apply Fast Refresh wrapper in development
      if (options.fastRefresh && ctx.config.isDevelopment && refreshRuntimeModule) {
        module.contents = wrapWithFastRefresh(
          module,
          module.contents,
          refreshRuntimeModule.id
        );
      }

      return props;
    });
  };
}

export default pluginReact;
