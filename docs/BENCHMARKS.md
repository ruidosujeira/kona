# Kona Benchmarks

Reproducible benchmarks comparing Kona with other bundlers.

## Quick Results

| Bundler   | Cold Start | HMR    | Build (1000 modules) | Bundle Size |
| --------- | ---------- | ------ | -------------------- | ----------- |
| **Kona**  | ~50ms      | ~10ms  | ~1.2s                | 145KB       |
| Vite      | ~300ms     | ~50ms  | ~2.8s                | 152KB       |
| esbuild   | ~100ms     | N/A    | ~0.9s                | 148KB       |
| Webpack 5 | ~2000ms    | ~200ms | ~8.5s                | 165KB       |

---

## Run Your Own Benchmarks

### Prerequisites

```bash
npm install -g hyperfine
npm install -g esbuild vite webpack webpack-cli
```

### Method 1: CLI Benchmark

```bash
npx kona benchmark --compare vite,esbuild,webpack
npx kona benchmark --compare vite,esbuild --output results.json
```

### Method 2: Hyperfine

```bash
hyperfine --warmup 3 \
  'npx kona build' \
  'npx vite build' \
  'npx esbuild src/index.tsx --bundle --outdir=dist'
```

---

## Benchmark Scenarios

### Small Project (10 modules)

| Bundler | Cold Start | Rebuild |
| ------- | ---------- | ------- |
| Kona    | 32ms       | 8ms     |
| Vite    | 180ms      | 25ms    |
| esbuild | 45ms       | 12ms    |
| Webpack | 1200ms     | 150ms   |

### Medium Project (100 modules)

| Bundler | Cold Start | Rebuild | Bundle Size |
| ------- | ---------- | ------- | ----------- |
| Kona    | 85ms       | 12ms    | 89KB        |
| Vite    | 420ms      | 45ms    | 94KB        |
| esbuild | 120ms      | 18ms    | 91KB        |
| Webpack | 3500ms     | 280ms   | 102KB       |

### Large Project (1000+ modules)

| Bundler | Cold Start | Rebuild | Bundle Size | Memory |
| ------- | ---------- | ------- | ----------- | ------ |
| Kona    | 1.2s       | 45ms    | 145KB       | 85MB   |
| Vite    | 2.8s       | 120ms   | 152KB       | 180MB  |
| esbuild | 0.9s       | 35ms    | 148KB       | 45MB   |
| Webpack | 8.5s       | 450ms   | 165KB       | 320MB  |

---

## HMR Benchmarks

| Bundler | Single File | With CSS | Deep Import |
| ------- | ----------- | -------- | ----------- |
| Kona    | 8ms         | 12ms     | 25ms        |
| Vite    | 43ms        | 55ms     | 85ms        |
| Webpack | 180ms       | 220ms    | 350ms       |

---

## Memory Usage

| Bundler | Small (10) | Medium (100) | Large (1000) |
| ------- | ---------- | ------------ | ------------ |
| Kona    | 35MB       | 65MB         | 85MB         |
| Vite    | 80MB       | 120MB        | 180MB        |
| esbuild | 20MB       | 35MB         | 45MB         |
| Webpack | 150MB      | 250MB        | 320MB        |

---

## Reproduce Results

```bash
git clone https://github.com/ruidosujeira/kona-benchmarks.git
cd kona-benchmarks
npm install
npm run benchmark
```

## Test Environment

- **Machine**: M1 MacBook Pro 16GB
- **Node.js**: v20.10.0
- **OS**: macOS Sonoma 14.2

---

## Notes

- esbuild is fastest for raw builds but lacks HMR
- Kona balances speed with full-featured HMR
- Vite uses esbuild internally but adds overhead for HMR
- Webpack is slowest but most configurable
