<div align="center">
  <img src="./logo.svg" width="180" alt="Kona">
  <h1>Kona</h1>
  <p><strong>The blazing-fast JavaScript/TypeScript bundler for 2025</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/kona"><img src="https://img.shields.io/npm/v/kona.svg?style=flat-square" alt="npm"></a>
    <a href="https://www.npmjs.com/package/kona"><img src="https://img.shields.io/npm/dm/kona.svg?style=flat-square" alt="downloads"></a>
    <a href="#"><img src="https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square" alt="TypeScript"></a>
    <a href="#"><img src="https://img.shields.io/badge/Rust-WASM-orange?style=flat-square" alt="Rust"></a>
    <a href="https://github.com/ruidosujeira/kona/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="license"></a>
  </p>

  <p>
    <a href="#quick-start">Quick Start</a> •
    <a href="#features">Features</a> •
    <a href="#cli">CLI</a> •
    <a href="#benchmarks">Benchmarks</a> •
    <a href="https://ruidosujeira.github.io/kona/">API Docs</a>
  </p>
</div>

---

## Why Kona?

| Feature                | Kona        | Vite   | esbuild | Webpack |
| ---------------------- | ----------- | ------ | ------- | ------- |
| **Cold Start**         | ~50ms       | ~300ms | ~100ms  | ~2000ms |
| **HMR Update**         | ~10ms       | ~50ms  | N/A     | ~200ms  |
| **Production Build**   | ⚡ Fast     | Fast   | ⚡ Fast | Slow    |
| **TypeScript**         | Native      | Plugin | Native  | Plugin  |
| **React Fast Refresh** | ✅          | ✅     | ❌      | Plugin  |
| **SSR**                | ✅ Built-in | Plugin | ❌      | Plugin  |
| **WASM Optimizer**     | ✅ Rust     | ❌     | ❌      | ❌      |
| **Tree Shaking**       | ✅ Rust     | ✅     | ✅      | ✅      |
| **Code Splitting**     | ✅          | ✅     | ✅      | ✅      |

## Quick Start

```bash
# Install
npm install kona --save-dev

# Create project
npx kona init my-app

# Development
npx kona dev

# Production build
npx kona build

# Compare with other bundlers
npx kona benchmark
```

### Minimal Config

```ts
// kona.ts
import { kona } from 'kona';

kona({
  target: 'browser',
  entry: 'src/index.tsx',
  devServer: true,
}).runDev();
```

## Features

### 🚀 Rust-Powered Performance

Kona uses Rust/WASM for critical operations:

```bash
# Build WASM optimizer (optional, auto-fallback to JS)
npm run build:wasm
```

- **2-5x faster** minification vs Terser
- **3-10x faster** tree-shaking analysis
- Zero-config, automatic fallback

### 📦 Native ESM Support

Full ECMAScript Modules with modern features:

```ts
// Dynamic imports with code splitting
const module = await import('./lazy.js');

// import.meta support
console.log(import.meta.url);
const config = import.meta.resolve('./config.json');

// Top-level await
const data = await fetch('/api/data').then((r) => r.json());

// .mjs, .mts, .cjs, .cts extensions
import utils from './utils.mjs';
```

### ⚛️ React Plugin

```ts
import { kona, pluginReact } from 'kona';

kona({
  entry: 'src/App.tsx',
  plugins: [
    pluginReact({
      fastRefresh: true, // Instant HMR
      runtime: 'automatic', // React 17+ JSX
    }),
  ],
}).runDev();
```

### 🌐 Next.js-Style SSR

```ts
import { kona, pluginNextJS } from 'kona';

kona({
  entry: 'src/index.tsx',
  plugins: [
    pluginNextJS({
      ssr: true,
      appDir: './app',
      serverActions: true,
      streaming: true, // React 18 streaming
    }),
  ],
}).runProd();
```

**Supports:**

- App Router (`app/` directory)
- Server Components (`'use client'` / `'use server'`)
- Server Actions
- Automatic hydration payload

### 🔥 Enhanced HMR

```ts
kona({
  hmr: {
    enhanced: true,
    preserveState: true, // Keep component state
    overlay: true, // Error overlay
    cssHotReload: true, // CSS without refresh
  },
});
```

### 🧹 Depclean Mode

Automatically detect unused dependencies:

```ts
import { kona, createDepcleanPlugin } from 'kona';

kona({
  plugins: [
    createDepcleanPlugin({
      enabled: true,
      detectCircular: true,
      generateReport: true,
    }),
  ],
});
```

### 🔧 WebAssembly Support

```ts
// Auto-instantiate
import wasm from './math.wasm';
const result = await wasm.ready;

// With custom imports
import init from './module.wasm?init';
const instance = await init({ env: { memory } });

// Raw bytes
import bytes from './module.wasm?bytes';
```

---

## CLI

### Commands

```bash
# Development server
kona dev [entry] [options]

# Production build
kona build [entry] [options]

# Initialize new project
kona init [name] [--template react|vue|vanilla]

# Benchmark against other bundlers
kona benchmark [--compare vite,esbuild,webpack]

# Analyze bundle
kona analyze [--open]

# Generate API docs
kona docs [--output ./docs]

# Clean cache and artifacts
kona clean

# Check for dependency issues
kona depclean [--fix]
```

### Options

```bash
Options:
  -c, --config <file>     Config file (default: fuse.ts)
  -m, --mode <mode>       Build mode: development | production
  -t, --target <target>   Target: browser | server | electron
  -w, --watch             Watch mode
  -p, --port <port>       Dev server port (default: 4444)
  --sourcemap             Generate source maps
  --minify                Minify output
  --analyze               Bundle analysis
  -h, --help              Show help
  -v, --version           Show version
```

### Examples

```bash
# Dev server on port 3000
kona dev src/index.tsx -p 3000

# Production build with analysis
kona build --minify --analyze

# Benchmark comparison
kona benchmark --compare vite,esbuild

# Initialize React project
kona init my-app --template react
```

---

## Benchmarks

Run your own benchmarks:

```bash
npx kona benchmark
```

### Sample Results (M1 MacBook Pro)

| Metric                   | Kona  | Vite  | esbuild |
| ------------------------ | ----- | ----- | ------- |
| **Cold Start**           | 47ms  | 312ms | 89ms    |
| **HMR Update**           | 8ms   | 43ms  | -       |
| **Build (1000 modules)** | 1.2s  | 2.8s  | 0.9s    |
| **Build (gzip)**         | 145KB | 152KB | 148KB   |
| **Memory Usage**         | 85MB  | 180MB | 45MB    |

---

## Configuration

### Full Config Example

```ts
// kona.ts
import { kona, pluginReact, pluginNextJS, pluginWasm, createDepcleanPlugin } from 'kona';

export default kona({
  // Entry points
  entry: 'src/index.tsx',

  // Target environment
  target: 'browser', // 'browser' | 'server' | 'electron'

  // Output configuration
  output: {
    dir: 'dist',
    publicPath: '/',
  },

  // Development server
  devServer: {
    port: 4444,
    open: true,
    https: false,
  },

  // HMR configuration
  hmr: {
    enabled: true,
    enhanced: true,
    preserveState: true,
    overlay: true,
  },

  // Source maps
  sourceMap: {
    project: true,
    vendor: false,
  },

  // Plugins
  plugins: [pluginReact({ fastRefresh: true }), pluginWasm({ inline: true }), createDepcleanPlugin({ enabled: true })],

  // Dependencies
  dependencies: {
    include: [],
    ignore: ['fsevents'],
  },

  // Cache
  cache: {
    enabled: true,
    dir: '.kona-cache',
  },
});
```

---

## API Documentation

Full API documentation is available at:

📚 **[https://ruidosujeira.github.io/kona/](https://ruidosujeira.github.io/kona/)**

Generate locally:

```bash
npm run docs
```

### Key APIs

```ts
// Core
import { kona } from 'kona';

// Plugins
import { pluginReact, pluginNextJS, pluginWasm, pluginCSS, pluginSass, pluginJSON, pluginRaw } from 'kona';

// Optimization
import { createDepcleanPlugin, runDepclean } from 'kona';

// HMR
import { createEnhancedHMR } from 'kona';

// Task runner
import { sparky } from 'kona';
```

---

## Migration from Vite/Webpack

### From Vite

```ts
// vite.config.ts → kona.ts
import { kona, pluginReact } from 'kona';

export default kona({
  entry: 'src/main.tsx', // root → entry
  target: 'browser',
  devServer: { port: 5173 }, // server.port
  plugins: [pluginReact()], // @vitejs/plugin-react
});
```

### From Webpack

```ts
// webpack.config.js → kona.ts
import { kona, pluginReact, pluginCSS } from 'kona';

export default kona({
  entry: 'src/index.tsx',
  output: { dir: 'dist' },
  plugins: [pluginReact(), pluginCSS()],
});
```

---

## TypeScript 5+

Kona is built with TypeScript 5.7 and supports all modern features:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "experimentalDecorators": true,
    "strict": true
  }
}
```

---

## Contributing

```bash
# Clone
git clone https://github.com/ruidosujeira/kona.git
cd kona

# Install
npm install

# Build WASM optimizer
npm run build:wasm

# Run tests
npm test

# Generate docs
npm run docs
```

---

## License

MIT © 2025 Kona Contributors
