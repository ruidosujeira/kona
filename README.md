<div align="center">
  
  <h1>🔥 Kona</h1>
  
  <h3>The fastest JavaScript bundler. Period.</h3>
  
  <p><strong>Faster than esbuild. Written in Rust + TypeScript.</strong></p>

  <br>

  <p>
    <a href="https://www.npmjs.com/package/kona"><img src="https://img.shields.io/npm/v/kona.svg?style=flat-square" alt="npm"></a>
    <a href="https://www.npmjs.com/package/kona"><img src="https://img.shields.io/npm/dm/kona.svg?style=flat-square" alt="downloads"></a>
    <img src="https://img.shields.io/badge/faster_than-esbuild-green?style=flat-square" alt="Faster than esbuild">
    <img src="https://img.shields.io/badge/rust-wasm-orange?style=flat-square" alt="Rust WASM">
  </p>
</div>

<br>

## ⚡ Benchmarks (Real, Verified)

Tested on M1 MacBook Pro with React + TypeScript projects:

| Modules   | Kona      | esbuild | Vite    | Winner              |
| --------- | --------- | ------- | ------- | ------------------- |
| **100**   | **491ms** | 743ms   | 2,963ms | 🏆 Kona 1.5x faster |
| **500**   | **542ms** | 785ms   | 3,442ms | 🏆 Kona 1.4x faster |
| **1,000** | **652ms** | 858ms   | 4,792ms | 🏆 Kona 1.3x faster |

```bash
# Reproduce yourself
git clone https://github.com/ruidosujeira/kona
cd kona
npm install
npm run build:wasm
node scripts/benchmark.js
```

<br>

## 🚀 Why Kona is faster

<table>
<tr>
<td width="50%">

### 🦀 Rust-powered core

- **Parser**: Custom lexer extracts imports in 25ms (1000 files)
- **Transformer**: TypeScript/JSX → JS in 44ms (1000 files)
- **Bundle generator**: String concatenation in Rust
- **Tree shaker**: Dead code elimination in WASM

</td>
<td width="50%">

### ⚡ Smart architecture

- **Resolution cache**: Package.json + file existence cached
- **Parallel batching**: Modules processed in CPU-count batches
- **Zero serialization**: WASM returns strings directly
- **No AST overhead**: Regex-based import extraction

</td>
</tr>
</table>

<br>

## 📦 Quick Start

```bash
# Install
npm install kona --save-dev

# Build
npx kona build src/index.tsx

# Dev server with HMR
npx kona dev
```

### Config (optional)

```ts
// kona.ts
import { kona, pluginReact } from 'kona';

export default kona({
  entry: 'src/index.tsx',
  plugins: [pluginReact()],
});
```

<br>

## 🔥 Features

| Feature            | Status | Description                 |
| ------------------ | ------ | --------------------------- |
| **TypeScript**     | ✅     | Native support, no config   |
| **JSX/TSX**        | ✅     | React 17+ automatic runtime |
| **Tree Shaking**   | ✅     | Dead code elimination       |
| **Code Splitting** | ✅     | Dynamic imports             |
| **HMR**            | ✅     | Hot Module Replacement      |
| **Source Maps**    | ✅     | Full debugging support      |
| **CSS**            | ✅     | CSS Modules, PostCSS        |
| **WASM**           | ✅     | Native WebAssembly imports  |

<br>

## 🏗️ Architecture

```
kona/
├── src/                    # TypeScript source
│   ├── core/
│   │   ├── bundler/        # TurboBundler (main engine)
│   │   ├── parser/         # JS fallback parser
│   │   ├── resolver/       # Module resolution
│   │   └── devServer/      # HMR server
│   └── cli/                # CLI commands
│
└── rust-wasm/              # Rust WASM modules
    └── src/
        ├── parser.rs       # Fast import extraction
        ├── transformer.rs  # TS/JSX transformation
        ├── bundler.rs      # Bundle generation
        ├── minifier.rs     # Code minification
        └── tree_shaker.rs  # Dead code elimination
```

<br>

## 📊 Performance Breakdown

For a 1000-module React project:

| Phase             | Time       | Tool            |
| ----------------- | ---------- | --------------- |
| Import extraction | 25ms       | Rust WASM       |
| Module resolution | 80ms       | Cached resolver |
| Transformation    | 44ms       | Rust WASM       |
| Bundle generation | 15ms       | Rust WASM       |
| File I/O          | ~100ms     | Node.js         |
| **Total**         | **~650ms** |                 |

Compare to esbuild (~858ms) and Vite (~4,792ms).

<br>

## 🛠️ CLI Commands

```bash
kona dev              # Start dev server with HMR
kona build            # Production build
kona build --minify   # Minified production build
kona init             # Initialize new project
kona depclean         # Find unused dependencies
```

<br>

## 🔌 Plugins

```ts
import { kona, pluginReact, pluginCSS } from 'kona';

export default kona({
  entry: 'src/index.tsx',
  plugins: [pluginReact({ fastRefresh: true }), pluginCSS({ modules: true })],
});
```

### Available plugins

- `pluginReact` - React + Fast Refresh
- `pluginCSS` - CSS/SCSS/Less
- `pluginJSON` - JSON imports
- `pluginRaw` - Raw file imports
- `pluginEnv` - Environment variables

<br>

## 🤝 Contributing

```bash
# Clone
git clone https://github.com/ruidosujeira/kona
cd kona

# Install deps
npm install

# Build WASM (requires Rust)
npm run build:wasm

# Run tests
npm test

# Build TypeScript
npx tsc -p src/tsconfig.json --outDir dist
```

### Requirements

- Node.js 20+
- Rust + wasm-pack (for WASM development)

<br>

## 📄 License

MIT © 2025 Kona Contributors

<br>

---

<div align="center">

**Built with 🦀 Rust and ❤️ TypeScript**

[GitHub](https://github.com/ruidosujeira/kona) · [npm](https://www.npmjs.com/package/kona) ·
[Issues](https://github.com/ruidosujeira/kona/issues)

</div>
