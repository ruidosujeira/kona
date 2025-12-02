<div align="center">
  
  <h1>🔥 Kona</h1>
  
  <h3>The fastest JavaScript bundler. Period.</h3>
  
  <p><strong>Faster than esbuild. Written in Rust + TypeScript.</strong></p>

  > ⚠️ **Alpha** - Fast, functional, but still evolving. Feedback welcome!

  <br>

  <!-- Badges -->
  <p>
    <a href="https://github.com/ruidosujeira/kona/actions/workflows/benchmark.yml"><img src="https://github.com/ruidosujeira/kona/actions/workflows/benchmark.yml/badge.svg" alt="Benchmark"></a>
    <a href="https://www.npmjs.com/package/kona-bundler"><img src="https://img.shields.io/npm/v/kona.svg?style=flat-square" alt="npm"></a>
    <a href="https://www.npmjs.com/package/kona-bundler"><img src="https://img.shields.io/npm/dm/kona.svg?style=flat-square" alt="downloads"></a>
    <img src="https://img.shields.io/badge/faster_than-esbuild-brightgreen?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMyAyTDMgMTRoOWwtMSA4IDEwLTEyaC05bDEtOHoiLz48L3N2Zz4=" alt="Faster than esbuild">
    <img src="https://img.shields.io/badge/rust-wasm-orange?style=flat-square&logo=rust" alt="Rust WASM">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License">
  </p>
  
  <br>

  <!-- Performance Chart -->
  <img src="https://quickchart.io/chart?c={type:'bar',data:{labels:['100 modules','500 modules','1000 modules'],datasets:[{label:'Kona',data:[511,611,655],backgroundColor:'%2310b981'},{label:'esbuild',data:[732,810,835],backgroundColor:'%23fbbf24'},{label:'Vite',data:[2543,3351,4092],backgroundColor:'%23ef4444'},{label:'Rollup',data:[669,709,671],backgroundColor:'%236366f1'}]},options:{plugins:{title:{display:true,text:'Build Time (ms) - Lower is Better'}},scales:{y:{beginAtZero:true}}}}&w=600&h=300" alt="Benchmark Chart">

<br><br>

  <!-- HMR Demo -->
  <details>
  <summary><strong>🎬 See HMR in action (click to expand)</strong></summary>
  <br>
  
  ```
  ┌─────────────────────────────────────────────────────────┐
  │  $ kona dev                                             │
  │                                                         │
  │  ⚡ Kona dev server ready in 302ms                      │
  │                                                         │
  │  ➜  Local:   http://localhost:4444                      │
  │  👀 Watching: src                                       │
  │                                                         │
  │  📝 Changed: src/App.tsx                                │
  │  ↻ Rebuilding...                                        │
  │  ✓ Rebuilt in 34ms                                      │
  │                                                         │
  │  📝 Changed: src/components/Button.tsx                  │
  │  ↻ Rebuilding...                                        │
  │  ✓ Rebuilt in 28ms                                      │
  └─────────────────────────────────────────────────────────┘
  ```
  
  **34ms HMR updates** - Your changes appear instantly.
  
  </details>

</div>

<br>

## ⚡ Benchmarks (Real, Verified)

```
Build Time (ms) - 1000 TypeScript/React modules
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kona     ████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  655ms 🏆
esbuild  ██████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  835ms
Rollup   ████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  671ms
Vite     ████████████████████████████████████████████████████████████████ 4092ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

| Modules   | Kona      | esbuild | Vite    | Rollup | vs esbuild      |
| --------- | --------- | ------- | ------- | ------ | --------------- |
| **100**   | **511ms** | 732ms   | 2,543ms | 669ms  | **1.4x faster** |
| **500**   | **611ms** | 810ms   | 3,351ms | 709ms  | **1.3x faster** |
| **1,000** | **655ms** | 835ms   | 4,092ms | 671ms  | **1.3x faster** |

<details>
<summary><strong>📊 Methodology (click to expand)</strong></summary>

### Test Environment

- **Machine**: Intel Core i5-1038NG7 @ 2.00GHz, 16GB RAM
- **OS**: macOS 26.1
- **Node.js**: v22.19.0

### Test Configuration

| Setting       | Value                  |
| ------------- | ---------------------- |
| Tree shaking  | OFF (fair comparison)  |
| Minification  | OFF                    |
| Source maps   | OFF                    |
| TypeScript    | YES (100% .tsx files)  |
| JSX           | YES (React components) |
| External deps | react, react-dom       |

### Project Structure

- **100 modules**: 102 files, 1,060 lines
- **500 modules**: 502 files, 5,300 lines
- **1,000 modules**: 1,002 files, 10,600 lines

Each project includes:

- React components with hooks
- TypeScript interfaces
- Dynamic imports
- Utility functions

### Measurement

- 5 runs per bundler
- First run discarded (warmup)
- Results: average of runs 2-5

</details>

### Reproduce Yourself

```bash
git clone https://github.com/ruidosujeira/kona
cd kona
npm install && npm run build:wasm

# Generate test project
node -e "
const fs = require('fs');
const dir = '/tmp/kona-test';
fs.mkdirSync(dir + '/src', { recursive: true });
for (let i = 0; i < 100; i++) {
  fs.writeFileSync(dir + '/src/Component' + i + '.tsx',
    'import React from \"react\";\nexport const Component' + i + ' = () => <div>Component ' + i + '</div>;');
}
fs.writeFileSync(dir + '/src/index.tsx',
  Array.from({length: 100}, (_, i) => 'import { Component' + i + ' } from \"./Component' + i + '\";').join('\n') +
  '\nexport default function App() { return <div>' +
  Array.from({length: 100}, (_, i) => '<Component' + i + ' />').join('') + '</div>; }');
"

# Run benchmarks
time npx kona build /tmp/kona-test/src/index.tsx
time npx esbuild /tmp/kona-test/src/index.tsx --bundle --outfile=/tmp/out.js
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
npm install kona-bundler --save-dev

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
