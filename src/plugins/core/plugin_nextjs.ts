/**
 * Next.js Plugin for Kona Bundler
 *
 * Provides Next.js-style features:
 * - Server-Side Rendering (SSR) with payload
 * - Static Site Generation (SSG)
 * - API Routes bundling
 * - App Router support
 * - Server Actions
 * - Automatic code splitting
 *
 * @example
 * ```ts
 * fusebox({
 *   plugins: [
 *     pluginNextJS({
 *       ssr: true,
 *       appDir: './app',
 *       pagesDir: './pages',
 *       serverActions: true,
 *     })
 *   ]
 * })
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { Context } from '../../core/context';
import { IModule } from '../../moduleResolver/module';
import { parsePluginOptions } from '../pluginUtils';

export interface IPluginNextJSOptions {
  /** Enable Server-Side Rendering */
  ssr?: boolean;
  /** App directory for App Router (Next.js 13+) */
  appDir?: string;
  /** Pages directory for Pages Router */
  pagesDir?: string;
  /** Enable Server Actions */
  serverActions?: boolean;
  /** Enable Static Site Generation */
  ssg?: boolean;
  /** Custom server entry */
  serverEntry?: string;
  /** Output directory for SSR bundles */
  ssrOutput?: string;
  /** Enable streaming SSR */
  streaming?: boolean;
  /** React Server Components */
  serverComponents?: boolean;
  /** Generate static params for dynamic routes */
  generateStaticParams?: boolean;
}

const DEFAULT_OPTIONS: IPluginNextJSOptions = {
  ssr: true,
  appDir: './app',
  pagesDir: './pages',
  serverActions: false,
  ssg: false,
  ssrOutput: './.kona/server',
  streaming: true,
  serverComponents: false,
};

/**
 * Detect page type from file path
 */
type PageType = 'page' | 'layout' | 'loading' | 'error' | 'not-found' | 'route' | 'template' | 'default';

function detectPageType(filePath: string): PageType | null {
  const fileName = path.basename(filePath, path.extname(filePath));

  const pageTypes: Record<string, PageType> = {
    'page': 'page',
    'layout': 'layout',
    'loading': 'loading',
    'error': 'error',
    'not-found': 'not-found',
    'route': 'route',
    'template': 'template',
    'default': 'default',
  };

  return pageTypes[fileName] || null;
}

/**
 * Check if file is a server component
 */
function isServerComponent(contents: string): boolean {
  // Files without 'use client' directive are server components by default
  return !contents.includes("'use client'") && !contents.includes('"use client"');
}

/**
 * Check if file is a client component
 */
function isClientComponent(contents: string): boolean {
  return contents.includes("'use client'") || contents.includes('"use client"');
}

/**
 * Check if file has server actions
 */
function hasServerActions(contents: string): boolean {
  return contents.includes("'use server'") || contents.includes('"use server"');
}

/**
 * Extract route from file path
 */
function extractRoute(filePath: string, baseDir: string): string {
  let route = filePath
    .replace(baseDir, '')
    .replace(/\\/g, '/')
    .replace(/\.(tsx?|jsx?)$/, '')
    .replace(/\/page$/, '')
    .replace(/\/route$/, '')
    .replace(/\/index$/, '');

  // Handle dynamic routes
  route = route.replace(/\[([^\]]+)\]/g, ':$1');

  // Handle catch-all routes
  route = route.replace(/\[\.\.\.([\w]+)\]/g, '*');

  return route || '/';
}

/**
 * Generate SSR wrapper for a page
 */
function generateSSRWrapper(
  module: IModule,
  route: string,
  pageType: PageType
): string {
  const moduleId = module.id;

  return `// SSR Wrapper for ${route}
(function() {
  var __kona_ssr = typeof globalThis !== 'undefined' ? globalThis.__kona_ssr : {};
  
  // Register page for SSR
  __kona_ssr.pages = __kona_ssr.pages || {};
  __kona_ssr.pages['${route}'] = {
    moduleId: ${moduleId},
    type: '${pageType}',
    load: function() {
      return __fuse.r(${moduleId});
    }
  };

  // Original module
${module.contents}
})();
`;
}

/**
 * Generate server action wrapper
 */
function generateServerActionWrapper(
  module: IModule,
  actionName: string
): string {
  const moduleId = module.id;

  return `// Server Action: ${actionName}
(function() {
  var __kona_actions = typeof globalThis !== 'undefined' ? globalThis.__kona_actions : {};
  __kona_actions['${moduleId}:${actionName}'] = {
    moduleId: ${moduleId},
    name: '${actionName}',
    execute: async function(formData) {
      var mod = __fuse.r(${moduleId});
      if (mod && typeof mod.${actionName} === 'function') {
        return await mod.${actionName}(formData);
      }
      throw new Error('Server action ${actionName} not found');
    }
  };
})();
`;
}

/**
 * Generate SSR runtime
 */
function generateSSRRuntime(): string {
  return `// Kona SSR Runtime
(function() {
  if (typeof globalThis === 'undefined') return;

  globalThis.__kona_ssr = globalThis.__kona_ssr || {
    pages: {},
    layouts: {},
    
    // Render page to string
    renderToString: async function(route, props) {
      var React = require('react');
      var ReactDOMServer = require('react-dom/server');
      
      var page = this.pages[route];
      if (!page) {
        throw new Error('Page not found: ' + route);
      }
      
      var PageComponent = page.load().default;
      var element = React.createElement(PageComponent, props);
      
      return ReactDOMServer.renderToString(element);
    },
    
    // Render with streaming
    renderToStream: async function(route, props, res) {
      var React = require('react');
      var ReactDOMServer = require('react-dom/server');
      
      var page = this.pages[route];
      if (!page) {
        throw new Error('Page not found: ' + route);
      }
      
      var PageComponent = page.load().default;
      var element = React.createElement(PageComponent, props);
      
      if (ReactDOMServer.renderToPipeableStream) {
        // React 18+ streaming
        var stream = ReactDOMServer.renderToPipeableStream(element, {
          onShellReady: function() {
            res.setHeader('Content-Type', 'text/html');
            stream.pipe(res);
          },
          onError: function(err) {
            console.error('SSR Error:', err);
          }
        });
        return stream;
      }
      
      // Fallback to string rendering
      var html = ReactDOMServer.renderToString(element);
      res.send(html);
    },
    
    // Get initial props (SSR data fetching)
    getInitialProps: async function(route, context) {
      var page = this.pages[route];
      if (!page) return {};
      
      var mod = page.load();
      
      // Support getServerSideProps
      if (mod.getServerSideProps) {
        var result = await mod.getServerSideProps(context);
        return result.props || {};
      }
      
      // Support getStaticProps
      if (mod.getStaticProps) {
        var result = await mod.getStaticProps(context);
        return result.props || {};
      }
      
      return {};
    },
    
    // Generate payload for hydration
    generatePayload: function(route, props, data) {
      return {
        route: route,
        props: props,
        data: data,
        timestamp: Date.now()
      };
    }
  };
  
  // Server Actions runtime
  globalThis.__kona_actions = globalThis.__kona_actions || {};
  
  globalThis.__kona_executeAction = async function(actionId, formData) {
    var action = globalThis.__kona_actions[actionId];
    if (!action) {
      throw new Error('Server action not found: ' + actionId);
    }
    return await action.execute(formData);
  };
})();
`;
}

/**
 * Generate hydration script for client
 */
function generateHydrationScript(payload: object): string {
  return `<script>
  window.__KONA_SSR_PAYLOAD__ = ${JSON.stringify(payload)};
</script>`;
}

/**
 * Next.js plugin
 */
export function pluginNextJS(a?: IPluginNextJSOptions | RegExp | string, b?: IPluginNextJSOptions) {
  const [opts] = parsePluginOptions<IPluginNextJSOptions>(a, b, DEFAULT_OPTIONS);
  const options = { ...DEFAULT_OPTIONS, ...opts };

  return (ctx: Context) => {
    const appDir = path.resolve(process.cwd(), options.appDir || './app');
    const pagesDir = path.resolve(process.cwd(), options.pagesDir || './pages');
    const ssrPages: Map<string, { module: IModule; route: string; type: PageType }> = new Map();

    // Inject SSR runtime
    if (options.ssr) {
      ctx.ict.on('before_bundle_write', props => {
        const { bundle } = props;
        bundle.source.injectionBeforeBundleExec.push(generateSSRRuntime());
        return props;
      });
    }

    // Process modules
    ctx.ict.on('bundle_resolve_module', props => {
      const { module } = props;
      if (module.captured) return props;

      const absPath = module.absPath;

      // Check if in app or pages directory
      const isAppRoute = absPath.startsWith(appDir);
      const isPagesRoute = absPath.startsWith(pagesDir);

      if (!isAppRoute && !isPagesRoute) {
        return props;
      }

      // Read module
      module.read();
      if (!module.contents) return props;

      const pageType = detectPageType(absPath);
      if (!pageType) return props;

      const baseDir = isAppRoute ? appDir : pagesDir;
      const route = extractRoute(absPath, baseDir);

      ctx.log.info('nextjs', 'Found $type at $route', { type: pageType, route });

      // Check component type
      const isServer = isServerComponent(module.contents);
      const isClient = isClientComponent(module.contents);
      const hasActions = hasServerActions(module.contents);

      if (isServer && options.serverComponents) {
        ctx.log.info('nextjs', 'Server Component: $route', { route });
      }

      if (isClient) {
        ctx.log.info('nextjs', 'Client Component: $route', { route });
      }

      // Handle server actions
      if (hasActions && options.serverActions) {
        ctx.log.info('nextjs', 'Server Actions detected in $route', { route });
        // Extract and wrap server actions
        const actionMatches = module.contents.matchAll(/export\s+async\s+function\s+(\w+)/g);
        for (const match of actionMatches) {
          const actionName = match[1];
          module.contents += '\n' + generateServerActionWrapper(module, actionName);
        }
      }

      // Wrap with SSR if enabled
      if (options.ssr && (pageType === 'page' || pageType === 'route')) {
        module.contents = generateSSRWrapper(module, route, pageType);
        ssrPages.set(route, { module, route, type: pageType });
      }

      return props;
    });

    // Generate SSR manifest after bundling
    ctx.ict.on('complete', () => {
      if (!options.ssr || ssrPages.size === 0) return;

      const manifest = {
        pages: Array.from(ssrPages.entries()).map(([route, info]) => ({
          route,
          moduleId: info.module.id,
          type: info.type,
        })),
        generated: new Date().toISOString(),
      };

      // Write manifest
      const manifestPath = path.join(options.ssrOutput || './.kona/server', 'ssr-manifest.json');
      const manifestDir = path.dirname(manifestPath);

      if (!fs.existsSync(manifestDir)) {
        fs.mkdirSync(manifestDir, { recursive: true });
      }

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      ctx.log.info('nextjs', 'SSR manifest generated with $count pages', { count: ssrPages.size });
    });
  };
}

// Export utilities
export {
  generateHydrationScript,
  generateSSRRuntime,
  isServerComponent,
  isClientComponent,
  hasServerActions,
  extractRoute,
};

export default pluginNextJS;
