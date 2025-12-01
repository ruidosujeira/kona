# Kona WASM Module

High-performance tree-shaking and minification for the Kona bundler, implemented in Rust and compiled to WebAssembly.

## Prerequisites

- [Rust](https://rustup.rs/) (1.75+)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

## Installation

```bash
# Install wasm-pack if not already installed
cargo install wasm-pack

# Or via npm
npm install -g wasm-pack
```

## Building

```bash
# From the rust-wasm directory
wasm-pack build --target nodejs --out-dir pkg

# Or from the project root
npm run build:wasm
```

## Development

```bash
# Run tests
cargo test

# Build in debug mode
wasm-pack build --target nodejs --dev --out-dir pkg
```

## Architecture

### Tree Shaking (`tree_shaker.rs`)

The tree-shaker analyzes JavaScript modules to:
- Extract export/import relationships
- Build a dependency graph
- Identify and remove unused exports
- Preserve side effects when configured

### Minification (`minifier.rs`)

The minifier uses SWC (Speedy Web Compiler) to:
- Parse JavaScript/TypeScript code
- Apply compression optimizations
- Mangle variable names
- Generate source maps

## Performance

The Rust WASM implementation provides significant performance improvements:
- **2-5x faster** minification compared to Terser
- **3-10x faster** tree-shaking analysis
- Lower memory usage for large bundles

## Integration

The WASM module is automatically loaded by the Kona bundler when available. If the WASM module is not built, the bundler falls back to JavaScript implementations (Terser for minification).

```typescript
import { getOptimizer, isWasmAvailable } from './wasm/optimizer';

if (isWasmAvailable()) {
  console.log('Using Rust WASM optimizer');
}

const optimizer = getOptimizer();
const result = await optimizer.minify(code);
```

## License

MIT
