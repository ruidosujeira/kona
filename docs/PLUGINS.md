# Kona Plugin Development Guide

This guide explains how to create custom plugins for Kona bundler.

## Table of Contents

- [Plugin Architecture](#plugin-architecture)
- [Basic Plugin Structure](#basic-plugin-structure)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Real-World Examples](#real-world-examples)
- [Testing Plugins](#testing-plugins)
- [Best Practices](#best-practices)

---

## Plugin Architecture

Kona plugins are functions that receive a `Context` object and register handlers for various lifecycle events.

```
┌─────────────────────────────────────────────────────────────┐
│                      Kona Bundler                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Plugin  │  │ Plugin  │  │ Plugin  │  │ Plugin  │        │
│  │  React  │  │  WASM   │  │  CSS    │  │ Custom  │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
│       └────────────┴────────────┴────────────┘              │
│                         │                                   │
│                    ┌────▼────┐                              │
│                    │ Context │                              │
│                    │  (ICT)  │                              │
│                    └────┬────┘                              │
│                         │                                   │
│    ┌────────────────────┼────────────────────┐              │
│    │                    │                    │              │
│    ▼                    ▼                    ▼              │
│ ┌──────┐          ┌──────────┐         ┌─────────┐         │
│ │Resolve│          │Transform │         │ Bundle  │         │
│ └──────┘          └──────────┘         └─────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Basic Plugin Structure

### Minimal Plugin

```typescript
import { Context } from 'kona';

export interface IMyPluginOptions {
  enabled?: boolean;
  // your options here
}

export function pluginMyPlugin(options: IMyPluginOptions = {}) {
  return (ctx: Context) => {
    // Plugin initialization
    ctx.log.info('MyPlugin', 'Plugin initialized');

    // Register event handlers
    ctx.ict.on('bundle_resolve_module', (props) => {
      // Handle module resolution
      return props;
    });
  };
}
```

### Plugin with Full Lifecycle

```typescript
import { Context } from 'kona';
import * as path from 'path';

export interface IPluginOptions {
  include?: RegExp[];
  exclude?: RegExp[];
  transform?: boolean;
}

export function pluginExample(options: IPluginOptions = {}) {
  const defaults: IPluginOptions = {
    include: [/\.example$/],
    exclude: [],
    transform: true,
  };

  const opts = { ...defaults, ...options };

  return (ctx: Context) => {
    // 1. INITIALIZATION
    // Called once when plugin is loaded
    ctx.ict.on('init', ({ ctx }) => {
      ctx.log.info('Example', 'Initializing plugin...');
    });

    // 2. MODULE RESOLUTION
    // Called for each module being resolved
    ctx.ict.on('bundle_resolve_module', (props) => {
      const { module } = props;

      // Check if this plugin should handle this file
      if (!shouldHandle(module.absPath, opts)) {
        return props;
      }

      // Transform the module contents
      if (opts.transform) {
        module.contents = transformContents(module.contents);
      }

      // Mark as handled
      module.isPluginHandled = true;

      return props;
    });

    // 3. BEFORE BUNDLE
    // Called before bundling starts
    ctx.ict.on('before_bundle', (props) => {
      ctx.log.verbose('Example', 'Preparing bundle...');
      return props;
    });

    // 4. AFTER BUNDLE
    // Called after bundling completes
    ctx.ict.on('after_bundle', (props) => {
      ctx.log.verbose('Example', 'Bundle complete');
      return props;
    });

    // 5. COMPLETE
    // Called when everything is done
    ctx.ict.on('complete', (props) => {
      ctx.log.info('Example', 'Build finished');
      return props;
    });
  };
}

function shouldHandle(filePath: string, opts: IPluginOptions): boolean {
  const ext = path.extname(filePath);

  // Check excludes first
  for (const pattern of opts.exclude || []) {
    if (pattern.test(filePath)) return false;
  }

  // Check includes
  for (const pattern of opts.include || []) {
    if (pattern.test(filePath)) return true;
  }

  return false;
}

function transformContents(contents: string): string {
  // Your transformation logic here
  return contents;
}
```

---

## Plugin Lifecycle

### Event Order

```
1. init              → Plugin initialization
2. assemble_start    → Assembly begins
3. bundle_resolve_module → For each module
4. before_bundle     → Before final bundle
5. after_bundle      → After bundle created
6. complete          → Build finished
7. rebundle          → On file change (dev mode)
```

### Event Reference

| Event                   | Description           | Props                      |
| ----------------------- | --------------------- | -------------------------- |
| `init`                  | Plugin initialization | `{ ctx }`                  |
| `bundle_resolve_module` | Module resolution     | `{ module, ctx }`          |
| `before_bundle`         | Pre-bundling          | `{ ctx, bundles }`         |
| `after_bundle`          | Post-bundling         | `{ ctx, bundles }`         |
| `complete`              | Build complete        | `{ ctx, bundles, output }` |
| `rebundle`              | HMR rebundle          | `{ ctx, modules }`         |
| `watcher_reaction`      | File changed          | `{ reactionStack }`        |

---

## Real-World Examples

### Example 1: Markdown Plugin

Transform `.md` files to HTML:

```typescript
import { Context } from 'kona';
import { marked } from 'marked';

export interface IPluginMarkdownOptions {
  gfm?: boolean;
  sanitize?: boolean;
  wrapper?: string;
}

export function pluginMarkdown(options: IPluginMarkdownOptions = {}) {
  const opts = {
    gfm: true,
    sanitize: false,
    wrapper: 'div',
    ...options,
  };

  return (ctx: Context) => {
    ctx.ict.on('bundle_resolve_module', (props) => {
      const { module } = props;

      if (!module.absPath.endsWith('.md')) {
        return props;
      }

      // Parse markdown to HTML
      const html = marked(module.contents, {
        gfm: opts.gfm,
      });

      // Wrap in component
      const wrapped = `
        const html = ${JSON.stringify(html)};
        export default function Markdown() {
          return { __html: html };
        }
        export const raw = html;
      `;

      module.contents = wrapped;
      module.extension = '.js';

      return props;
    });
  };
}
```

**Usage:**

```typescript
import { kona, pluginMarkdown } from 'kona';

kona({
  entry: 'src/index.tsx',
  plugins: [pluginMarkdown({ gfm: true })],
}).runDev();
```

```typescript
// In your code
import readme from './README.md';
console.log(readme.raw); // HTML string
```

---

### Example 2: Environment Variables Plugin

Inject environment variables at build time:

```typescript
import { Context } from 'kona';
import * as fs from 'fs';
import * as path from 'path';

export interface IPluginEnvOptions {
  prefix?: string;
  envFile?: string;
  define?: Record<string, string>;
}

export function pluginEnv(options: IPluginEnvOptions = {}) {
  const opts = {
    prefix: 'KONA_',
    envFile: '.env',
    define: {},
    ...options,
  };

  return (ctx: Context) => {
    // Load .env file
    const envVars: Record<string, string> = { ...opts.define };

    const envPath = path.resolve(ctx.config.homeDir, opts.envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    }

    // Filter by prefix
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(envVars)) {
      if (key.startsWith(opts.prefix)) {
        filtered[key] = value;
      }
    }

    // Add process.env to filtered vars
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(opts.prefix) && value) {
        filtered[key] = value;
      }
    }

    ctx.ict.on('bundle_resolve_module', (props) => {
      const { module } = props;

      // Replace process.env.KONA_* references
      let contents = module.contents;

      for (const [key, value] of Object.entries(filtered)) {
        const regex = new RegExp(`process\\.env\\.${key}`, 'g');
        contents = contents.replace(regex, JSON.stringify(value));
      }

      // Replace import.meta.env
      contents = contents.replace(/import\.meta\.env/g, JSON.stringify(filtered));

      module.contents = contents;
      return props;
    });

    ctx.log.info('Env', `Loaded ${Object.keys(filtered).length} env variables`);
  };
}
```

**Usage:**

```typescript
kona({
  plugins: [
    pluginEnv({
      prefix: 'APP_',
      envFile: '.env.local',
      define: {
        APP_VERSION: '1.0.0',
      },
    }),
  ],
});
```

---

### Example 3: Image Optimization Plugin

Optimize images during build:

```typescript
import { Context } from 'kona';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface IPluginImageOptions {
  quality?: number;
  maxWidth?: number;
  formats?: ('webp' | 'avif' | 'original')[];
  outputDir?: string;
}

export function pluginImage(options: IPluginImageOptions = {}) {
  const opts = {
    quality: 80,
    maxWidth: 1920,
    formats: ['webp', 'original'] as const,
    outputDir: 'assets/images',
    ...options,
  };

  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const processedImages = new Map<string, string>();

  return (ctx: Context) => {
    ctx.ict.on('bundle_resolve_module', (props) => {
      const { module } = props;
      const ext = path.extname(module.absPath).toLowerCase();

      if (!imageExtensions.includes(ext)) {
        return props;
      }

      // Generate hash for caching
      const hash = crypto.createHash('md5').update(module.contents).digest('hex').slice(0, 8);

      const basename = path.basename(module.absPath, ext);
      const outputName = `${basename}-${hash}`;

      // For now, just copy and return URL
      // In production, you'd use sharp or similar for optimization
      const publicPath = `/${opts.outputDir}/${outputName}${ext}`;

      processedImages.set(module.absPath, publicPath);

      // Export as URL
      module.contents = `export default ${JSON.stringify(publicPath)};`;
      module.extension = '.js';

      return props;
    });

    ctx.ict.on('complete', async () => {
      // Copy images to output directory
      const outputDir = path.join(ctx.config.output?.dir || 'dist', opts.outputDir);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      for (const [src, dest] of processedImages) {
        const destPath = path.join(ctx.config.output?.dir || 'dist', dest);
        fs.copyFileSync(src, destPath);
      }

      ctx.log.info('Image', `Processed ${processedImages.size} images`);
    });
  };
}
```

---

### Example 4: GraphQL Plugin

Transform `.graphql` files:

```typescript
import { Context } from 'kona';
import { parse, print } from 'graphql';

export interface IPluginGraphQLOptions {
  tag?: string;
  minify?: boolean;
}

export function pluginGraphQL(options: IPluginGraphQLOptions = {}) {
  const opts = {
    tag: 'gql',
    minify: true,
    ...options,
  };

  return (ctx: Context) => {
    ctx.ict.on('bundle_resolve_module', (props) => {
      const { module } = props;

      if (!module.absPath.match(/\.(graphql|gql)$/)) {
        return props;
      }

      try {
        // Parse and optionally minify
        const ast = parse(module.contents);
        const query = opts.minify ? print(ast).replace(/\s+/g, ' ').trim() : print(ast);

        // Export as tagged template literal compatible
        module.contents = `
          const doc = ${JSON.stringify(query)};
          export default doc;
          export const ${opts.tag} = doc;
        `;
        module.extension = '.js';
      } catch (error) {
        ctx.log.error('GraphQL', `Parse error in ${module.absPath}: ${error.message}`);
      }

      return props;
    });
  };
}
```

**Usage:**

```typescript
// queries/getUser.graphql
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
  }
}
```

```typescript
// In your code
import GET_USER from './queries/getUser.graphql';

const result = await client.query({
  query: GET_USER,
  variables: { id: '123' },
});
```

---

### Example 5: Virtual Modules Plugin

Create virtual modules that don't exist on disk:

```typescript
import { Context } from 'kona';

export interface IVirtualModule {
  id: string;
  content: string | (() => string);
}

export interface IPluginVirtualOptions {
  modules: IVirtualModule[];
}

export function pluginVirtual(options: IPluginVirtualOptions) {
  const virtualModules = new Map<string, IVirtualModule>();

  for (const mod of options.modules) {
    virtualModules.set(mod.id, mod);
  }

  return (ctx: Context) => {
    // Intercept module resolution
    ctx.ict.on('bundle_resolve_module', (props) => {
      const { module } = props;

      // Check if this is a virtual module
      const virtualId = module.absPath.replace(/^virtual:/, '');
      const virtual = virtualModules.get(virtualId);

      if (virtual) {
        module.contents = typeof virtual.content === 'function' ? virtual.content() : virtual.content;
        module.isVirtual = true;
        return props;
      }

      return props;
    });
  };
}
```

**Usage:**

```typescript
kona({
  plugins: [
    pluginVirtual({
      modules: [
        {
          id: 'virtual:build-info',
          content: () => `
            export const buildTime = ${JSON.stringify(new Date().toISOString())};
            export const version = '1.0.0';
            export const env = ${JSON.stringify(process.env.NODE_ENV)};
          `,
        },
        {
          id: 'virtual:routes',
          content: `
            export const routes = [
              { path: '/', component: 'Home' },
              { path: '/about', component: 'About' },
            ];
          `,
        },
      ],
    }),
  ],
});
```

```typescript
// In your code
import { buildTime, version } from 'virtual:build-info';
console.log(`Built at ${buildTime}, version ${version}`);
```

---

## Testing Plugins

### Unit Testing

```typescript
import { pluginMarkdown } from './plugin_markdown';

describe('pluginMarkdown', () => {
  it('should transform markdown to HTML', () => {
    const mockCtx = createMockContext();
    const plugin = pluginMarkdown({ gfm: true });

    plugin(mockCtx);

    // Simulate module resolution
    const module = {
      absPath: '/test/readme.md',
      contents: '# Hello\n\nWorld',
    };

    const handler = mockCtx.ict.handlers.get('bundle_resolve_module');
    const result = handler({ module, ctx: mockCtx });

    expect(result.module.contents).toContain('<h1>Hello</h1>');
  });
});

function createMockContext() {
  const handlers = new Map();

  return {
    config: { homeDir: '/test' },
    log: {
      info: jest.fn(),
      error: jest.fn(),
      verbose: jest.fn(),
    },
    ict: {
      on: (event: string, handler: Function) => {
        handlers.set(event, handler);
      },
      handlers,
    },
  };
}
```

### Integration Testing

```typescript
import { kona } from 'kona';
import { pluginMarkdown } from './plugin_markdown';
import * as fs from 'fs';
import * as path from 'path';

describe('pluginMarkdown integration', () => {
  const testDir = path.join(__dirname, '__fixtures__');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'test.md'), '# Test\n\nHello world');
    fs.writeFileSync(path.join(testDir, 'index.ts'), `import md from './test.md';\nconsole.log(md);`);
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true });
  });

  it('should bundle markdown files', async () => {
    const result = await kona({
      entry: path.join(testDir, 'index.ts'),
      target: 'browser',
      plugins: [pluginMarkdown()],
    }).runProd();

    expect(result.bundles).toBeDefined();
    // Check output contains transformed markdown
  });
});
```

---

## Best Practices

### 1. Always Return Props

```typescript
// ✅ Good
ctx.ict.on('bundle_resolve_module', (props) => {
  // ... your logic
  return props; // Always return
});

// ❌ Bad
ctx.ict.on('bundle_resolve_module', (props) => {
  // ... your logic
  // Missing return!
});
```

### 2. Check File Extensions Early

```typescript
// ✅ Good - Early return for non-matching files
ctx.ict.on('bundle_resolve_module', (props) => {
  if (!props.module.absPath.endsWith('.md')) {
    return props;
  }
  // Process markdown...
  return props;
});
```

### 3. Use Verbose Logging

```typescript
// ✅ Good - Helps debugging
ctx.log.verbose('MyPlugin', `Processing ${module.absPath}`);
ctx.log.info('MyPlugin', `Transformed ${count} files`);

// Use verbose for frequent operations
// Use info for summary/important events
```

### 4. Handle Errors Gracefully

```typescript
ctx.ict.on('bundle_resolve_module', (props) => {
  try {
    // Risky operation
    const result = transform(props.module.contents);
    props.module.contents = result;
  } catch (error) {
    ctx.log.error('MyPlugin', `Error in ${props.module.absPath}: ${error.message}`);
    // Don't throw - let build continue
  }
  return props;
});
```

### 5. Document Your Options

````typescript
/**
 * Plugin for transforming X files
 *
 * @example
 * ```ts
 * kona({
 *   plugins: [
 *     pluginX({
 *       option1: true,
 *       option2: 'value',
 *     }),
 *   ],
 * });
 * ```
 */
export interface IPluginXOptions {
  /** Enable feature X (default: true) */
  option1?: boolean;
  /** Custom value for Y */
  option2?: string;
}
````

### 6. Support Both Dev and Prod

```typescript
ctx.ict.on('bundle_resolve_module', (props) => {
  const isDev = !ctx.config.isProduction;

  if (isDev) {
    // Add source maps, skip minification
    module.contents = addSourceMap(module.contents);
  } else {
    // Optimize for production
    module.contents = minify(module.contents);
  }

  return props;
});
```

---

## Plugin Template

Use this template to start a new plugin:

````typescript
/**
 * Kona Plugin: [Name]
 *
 * [Description of what this plugin does]
 *
 * @example
 * ```ts
 * import { kona } from 'kona';
 * import { pluginName } from './plugin_name';
 *
 * kona({
 *   plugins: [pluginName({ option: 'value' })],
 * }).runDev();
 * ```
 */

import { Context } from 'kona';

export interface IPluginNameOptions {
  /** Description of option */
  option?: string;
}

export function pluginName(options: IPluginNameOptions = {}) {
  const opts = {
    option: 'default',
    ...options,
  };

  return (ctx: Context) => {
    ctx.ict.on('bundle_resolve_module', (props) => {
      const { module } = props;

      // Your plugin logic here

      return props;
    });
  };
}
````

---

## Need Help?

- [GitHub Issues](https://github.com/ruidosujeira/kona/issues)
- [API Documentation](https://ruidosujeira.github.io/kona/)
- [Examples Repository](https://github.com/ruidosujeira/kona-examples)
