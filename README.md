<h2 align="center">LIMITED SUPPORT. USE AT YOUR OWN RISK</h2>

<p align="center">
  <img width="200" src="./logo.svg">
</p>

<h2 align="center">A bundler that does it right</h2>

<p align="center">
  <a href="#">
    <img
      alt="Downloads"
      src="https://badgen.net/npm/dm/fuse-box">
  </a>

  <a href="#">
    <img
      alt="Circle ci"
      src="https://badgen.net/circleci/github/fuse-box/fuse-box">
  </a>

  <a href="#">
    <img
      src="https://badgen.net/npm/v/fuse-box/next">
  </a>

  <a href="https://www.npmjs.com/package/fuse-box">
    <img
      alt="npm version"
      src="https://img.shields.io/npm/v/fuse-box.svg">
  </a>
  <a href="https://www.npmjs.com/package/fuse-box">
    <img
      alt="monthly downloads from npm"
      src="https://img.shields.io/npm/dm/fuse-box.svg">
  </a>
  <a href="https://github.com/prettier/prettier">
    <img
      alt="code style: prettier"
      src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg">
  </a>
  </br>
  <a href="#backers">
    <img
      alt="Backers on Open Collective"
      src="https://opencollective.com/fuse-box/backers/badge.svg">
  </a>
  <a href="#sponsors">
    <img
      alt="Sponsors on Open Collective"
      src="https://opencollective.com/fuse-box/sponsors/badge.svg">
  </a>
  
  <a href="https://twitter.com/FuseBoxJS">
    <img
      alt="Follow FuseBox on Twitter"
      src="https://img.shields.io/twitter/follow/FuseBoxJS.svg?label=follow+FuseBox">
  </a>

</p>

<p align="center"><a href="https://slack.fuse-box.org">FuseBox on slack</a><p>

# FUSEBOX v4 is out!

Install:

```
npm install fuse-box --save-dev
```

```ts
import { fusebox } from 'fuse-box';
fusebox({
  target: 'browser',
  entry: 'src/index.tsx',
  webIndex: {
    template: 'src/index.html',
  },
  devServer: true,
}).runDev();
```

## [React demo](https://github.com/fuse-box/react-example)

## ESM Support (2025)

Full native ECMAScript Modules support:

### Features

- **Native ESM** - Full support for `.mjs`, `.mts` files
- **`import.meta`** - `import.meta.url`, `import.meta.resolve()`
- **Dynamic imports** - `import()` with code splitting
- **Top-level await** - Async module initialization
- **Package exports** - Full `package.json` exports field support
- **Conditional exports** - `import`, `require`, `browser`, `node` conditions

### Example

```ts
// ESM syntax
import { foo } from './utils.mjs';
import * as utils from './helpers.mts';

// import.meta
console.log(import.meta.url);
const resolved = import.meta.resolve('./config.json');

// Dynamic imports
const module = await import('./lazy-module.js');

// Top-level await
const config = await fetch('/config.json').then(r => r.json());
```

## Rust WASM Optimizer

High-performance tree-shaking and minification powered by Rust:

```bash
# Build WASM module for faster builds
npm run build:wasm
```

### Performance

- **2-5x faster** minification vs Terser
- **3-10x faster** tree-shaking analysis
- Automatic fallback to JS when WASM unavailable
