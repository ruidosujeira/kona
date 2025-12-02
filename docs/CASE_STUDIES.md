# Kona Case Studies

Real-world projects and examples using Kona bundler.

---

## Case Study 1: E-Commerce Platform

### Company: TechShop (Fictional)

**Challenge**: Slow build times affecting developer productivity. Webpack builds taking 45+ seconds.

**Solution**: Migrated to Kona with React plugin.

**Results**:

- Build time: 45s → 2.1s (95% reduction)
- HMR: 800ms → 15ms
- Bundle size: 1.2MB → 890KB (26% reduction)
- Developer satisfaction: Significantly improved

### Configuration

```typescript
// kona.ts
import { kona, pluginReact, createDepcleanPlugin } from 'kona';

export default kona({
  target: 'browser',
  entry: 'src/index.tsx',

  output: {
    dir: 'dist',
    publicPath: '/assets/',
  },

  plugins: [
    pluginReact({
      fastRefresh: true,
      runtime: 'automatic',
    }),
    createDepcleanPlugin({
      enabled: true,
      detectCircular: true,
    }),
  ],

  devServer: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },

  cache: {
    enabled: true,
  },
});
```

### Project Structure

```
techshop/
├── src/
│   ├── index.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Products.tsx
│   │   ├── Cart.tsx
│   │   └── Checkout.tsx
│   ├── components/
│   │   ├── Header/
│   │   ├── ProductCard/
│   │   ├── CartItem/
│   │   └── ...
│   ├── hooks/
│   ├── services/
│   └── styles/
├── kona.ts
└── package.json
```

---

## Case Study 2: SaaS Dashboard

### Company: DataViz Pro (Fictional)

**Challenge**: Complex dashboard with 500+ components, slow initial load.

**Solution**: Kona with code splitting and lazy loading.

**Results**:

- Initial load: 4.2s → 1.1s
- Time to interactive: 6.5s → 2.3s
- Lighthouse score: 45 → 92

### Configuration

```typescript
// kona.ts
import { kona, pluginReact } from 'kona';

export default kona({
  target: 'browser',
  entry: 'src/index.tsx',

  codeSplitting: {
    enabled: true,
    maxSize: 50000, // 50KB chunks
  },

  plugins: [pluginReact({ fastRefresh: true })],

  optimization: {
    treeshake: true,
    minify: true,
  },
});
```

### Lazy Loading Pattern

```typescript
// src/routes.tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));

export function Routes() {
  return (
    <Suspense fallback={<Loading />}>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
      </Switch>
    </Suspense>
  );
}
```

---

## Case Study 3: Server-Side Rendered Blog

### Project: DevBlog

**Challenge**: SEO-friendly blog with fast page loads.

**Solution**: Kona with Next.js-style SSR plugin.

**Results**:

- First Contentful Paint: 2.8s → 0.8s
- SEO score: 65 → 98
- Core Web Vitals: All green

### Configuration

```typescript
// kona.ts
import { kona, pluginNextJS, pluginReact } from 'kona';

export default kona({
  target: 'server',
  entry: 'src/index.tsx',

  plugins: [
    pluginReact({ runtime: 'automatic' }),
    pluginNextJS({
      ssr: true,
      streaming: true,
      appDir: './app',
    }),
  ],
});
```

### App Structure

```
devblog/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── blog/
│   │   ├── page.tsx
│   │   └── [slug]/
│   │       └── page.tsx
│   └── about/
│       └── page.tsx
├── components/
├── lib/
├── kona.ts
└── package.json
```

### Server Component

```typescript
// app/blog/[slug]/page.tsx
import { getPost } from '@/lib/posts';

export default async function BlogPost({ params }) {
  const post = await getPost(params.slug);

  return (
    <article>
      <h1>{post.title}</h1>
      <time>{post.date}</time>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  );
}

export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);
  return {
    title: post.title,
    description: post.excerpt,
  };
}
```

---

## Case Study 4: Monorepo with Multiple Apps

### Project: Enterprise Suite

**Challenge**: 5 apps sharing common packages, inconsistent build configs.

**Solution**: Kona workspaces with shared configuration.

### Structure

```
enterprise-suite/
├── apps/
│   ├── admin/
│   │   ├── src/
│   │   └── kona.ts
│   ├── customer/
│   │   ├── src/
│   │   └── kona.ts
│   ├── api/
│   │   ├── src/
│   │   └── kona.ts
│   └── mobile-web/
│       ├── src/
│       └── kona.ts
├── packages/
│   ├── ui/
│   ├── utils/
│   ├── api-client/
│   └── config/
├── kona.base.ts
└── package.json
```

### Shared Configuration

```typescript
// kona.base.ts
import { pluginReact } from 'kona';

export const baseConfig = {
  plugins: [pluginReact({ fastRefresh: true })],
  cache: { enabled: true },
  optimization: {
    treeshake: true,
  },
};
```

```typescript
// apps/admin/kona.ts
import { kona } from 'kona';
import { baseConfig } from '../../kona.base';

export default kona({
  ...baseConfig,
  entry: 'src/index.tsx',
  target: 'browser',
  devServer: { port: 3001 },
});
```

### Build All Apps

```bash
# package.json scripts
{
  "scripts": {
    "dev": "npm-run-all --parallel dev:*",
    "dev:admin": "cd apps/admin && kona dev",
    "dev:customer": "cd apps/customer && kona dev",
    "build": "npm-run-all build:*",
    "build:admin": "cd apps/admin && kona build",
    "build:customer": "cd apps/customer && kona build"
  }
}
```

---

## Case Study 5: WebAssembly Integration

### Project: Image Editor

**Challenge**: CPU-intensive image processing in browser.

**Solution**: Kona with WASM plugin for Rust-based image processing.

### Configuration

```typescript
// kona.ts
import { kona, pluginWasm, pluginReact } from 'kona';

export default kona({
  target: 'browser',
  entry: 'src/index.tsx',

  plugins: [
    pluginReact({ fastRefresh: true }),
    pluginWasm({
      inline: false, // Load WASM separately
      streaming: true,
    }),
  ],
});
```

### WASM Usage

```typescript
// src/lib/imageProcessor.ts
import init, { process_image, apply_filter } from '../wasm/image_processor.wasm?init';

let wasmReady = false;

export async function initImageProcessor() {
  if (!wasmReady) {
    await init();
    wasmReady = true;
  }
}

export async function applyBlur(imageData: ImageData, radius: number) {
  await initImageProcessor();
  return apply_filter(imageData.data, imageData.width, imageData.height, 'blur', radius);
}

export async function resize(imageData: ImageData, width: number, height: number) {
  await initImageProcessor();
  return process_image(imageData.data, imageData.width, imageData.height, width, height);
}
```

### React Component

```typescript
// src/components/ImageEditor.tsx
import { useState, useCallback } from 'react';
import { applyBlur, resize } from '../lib/imageProcessor';

export function ImageEditor() {
  const [image, setImage] = useState<ImageData | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleBlur = useCallback(async () => {
    if (!image) return;
    setProcessing(true);
    const result = await applyBlur(image, 5);
    setImage(result);
    setProcessing(false);
  }, [image]);

  return (
    <div>
      <canvas ref={canvasRef} />
      <button onClick={handleBlur} disabled={processing}>
        {processing ? 'Processing...' : 'Apply Blur'}
      </button>
    </div>
  );
}
```

---

## Example Projects

### Starter Templates

| Template           | Description                | Link                                                                           |
| ------------------ | -------------------------- | ------------------------------------------------------------------------------ |
| React SPA          | Single page app with React | [kona-react-starter](https://github.com/ruidosujeira/kona-react-starter)       |
| React SSR          | Server-side rendered React | [kona-ssr-starter](https://github.com/ruidosujeira/kona-ssr-starter)           |
| TypeScript Library | Library with types         | [kona-lib-starter](https://github.com/ruidosujeira/kona-lib-starter)           |
| Monorepo           | Multi-package workspace    | [kona-monorepo-starter](https://github.com/ruidosujeira/kona-monorepo-starter) |

### Full Examples

```bash
# Clone examples repository
git clone https://github.com/ruidosujeira/kona-examples.git
cd kona-examples

# Run specific example
cd react-dashboard
npm install
npm run dev
```

### Available Examples

1. **react-dashboard** - Admin dashboard with charts
2. **ecommerce** - Full e-commerce with cart
3. **blog-ssr** - SSR blog with markdown
4. **component-library** - UI component library
5. **wasm-image-editor** - Image editor with WASM
6. **monorepo-apps** - Multiple apps sharing code

---

## Migration Guides

### From Webpack

```typescript
// Before (webpack.config.js)
module.exports = {
  entry: './src/index.tsx',
  output: { path: 'dist' },
  module: {
    rules: [
      { test: /\.tsx?$/, use: 'ts-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
};

// After (kona.ts)
import { kona, pluginReact, pluginCSS } from 'kona';

export default kona({
  entry: 'src/index.tsx',
  output: { dir: 'dist' },
  plugins: [pluginReact(), pluginCSS()],
});
```

### From Vite

```typescript
// Before (vite.config.ts)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
});

// After (kona.ts)
import { kona, pluginReact } from 'kona';

export default kona({
  entry: 'src/main.tsx',
  plugins: [pluginReact({ fastRefresh: true })],
  devServer: { port: 3000 },
});
```

---

## Performance Tips

### 1. Enable Caching

```typescript
kona({
  cache: {
    enabled: true,
    dir: '.kona-cache',
  },
});
```

### 2. Use Code Splitting

```typescript
// Lazy load routes
const Dashboard = lazy(() => import('./Dashboard'));
```

### 3. Exclude Large Dependencies

```typescript
kona({
  dependencies: {
    ignore: ['moment', 'lodash'], // Use lighter alternatives
  },
});
```

### 4. Enable Tree Shaking

```typescript
kona({
  optimization: {
    treeshake: true,
  },
});
```

### 5. Use WASM Optimizer

```bash
npm run build:wasm
```

---

## Need Help?

- [Documentation](https://ruidosujeira.github.io/kona/)
- [GitHub Issues](https://github.com/ruidosujeira/kona/issues)
- [Discord Community](https://discord.gg/kona)
