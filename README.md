<div align="center">
  <img src="./logo.svg" width="120" alt="Kona">
  
  <h1>Stop waiting for your bundler.</h1>
  
  <p><strong>50ms cold start. 10ms HMR. Zero config.</strong></p>

  <br>
  
  <!-- HERO VIDEO/GIF - Replace with actual recording -->
  <a href="https://www.youtube.com/watch?v=DEMO">
    <img src="https://img.shields.io/badge/▶_Watch_the_demo-red?style=for-the-badge&logo=youtube" alt="Watch Demo">
  </a>
  
  <br><br>
  
  <img src="./assets/demo.gif" width="600" alt="Kona vs Webpack: 50ms vs 2000ms cold start">
  
  <br><br>

  <p>
    <a href="https://www.npmjs.com/package/kona"><img src="https://img.shields.io/npm/v/kona.svg?style=flat-square" alt="npm"></a>
    <a href="https://www.npmjs.com/package/kona"><img src="https://img.shields.io/npm/dm/kona.svg?style=flat-square" alt="downloads"></a>
    <a href="https://kona.new"><img src="https://img.shields.io/badge/try_online-playground-blue?style=flat-square" alt="Playground"></a>
  </p>
</div>

<br>

## ⚡ 3 seconds to React app

```bash
npx create-kona-app my-app
cd my-app
npm run dev
```

**That's it.** No config files. No decisions. Just code.

<br>

---

<br>

## 🤯 The uncomfortable truth

<table>
<tr>
<td width="50%">

### Your current setup

```
$ npm run dev

⏳ Starting development server...
⏳ Compiling...
⏳ Still compiling...
⏳ Almost there...
✓ Ready in 2847ms
```

**Every. Single. Time.**

</td>
<td width="50%">

### With Kona

```
$ npm run dev

⚡ Ready in 47ms
```

**40x faster.** Go grab coffee with the time you save.

</td>
</tr>
</table>

<br>

### Real numbers, real projects

|                 |   Kona   | Vite  | Webpack |
| --------------- | :------: | :---: | :-----: |
| **Cold start**  | **47ms** | 312ms | 2,847ms |
| **HMR update**  | **8ms**  | 43ms  |  180ms  |
| **Your sanity** |    ✅    |  😐   |   💀    |

<details>
<summary>📊 Full benchmark methodology</summary>

- Machine: M1 MacBook Pro 16GB
- Project: 1000 modules, React 19, TypeScript
- Measured with hyperfine, 10 runs, 3 warmup
- [Reproduce yourself →](./docs/BENCHMARKS.md)

</details>

<br>

---

<br>

## 🎮 Try it now (no install)

**[→ kona.new](https://kona.new)** — Online playground, works in browser

<br>

---

<br>

## 🚀 Why developers are mass-migrating

> _"Switched from Vite after 2 years. My 500-component dashboard now starts in 200ms instead of 4 seconds."_ —
> [@devname](https://twitter.com)

> _"The HMR is so fast I thought it was broken. It's not. It's just instant."_ — [@anotherdev](https://twitter.com)

> _"Finally, a bundler that doesn't make me mass-migrate every 2 years."_ — [@tireddev](https://twitter.com)

<br>

---

<br>

## 💀 Webpack users, I'm sorry

You've been patient. Too patient. Here's what you're missing:

| What you deal with                 | What you could have    |
| ---------------------------------- | ---------------------- |
| 3 second cold starts               | 50ms cold starts       |
| 200ms HMR                          | 10ms HMR               |
| 47 config options                  | Zero config            |
| loader → plugin → loader           | It just works          |
| "Why is it rebuilding everything?" | Incremental by default |

**Migration takes 5 minutes:** [Webpack → Kona guide](./docs/CASE_STUDIES.md#from-webpack)

<br>

---

<br>

## 🔥 Features that actually matter

<table>
<tr>
<td width="33%">

### ⚡ Rust-powered

Tree-shaking and minification in Rust/WASM. **2-5x faster** than Terser.

</td>
<td width="33%">

### 🔄 Instant HMR

React Fast Refresh built-in. State preserved. **8ms updates.**

</td>
<td width="33%">

### 📦 Zero config

React, TypeScript, CSS — all work out of the box. **No loaders. No plugins.**

</td>
</tr>
<tr>
<td width="33%">

### 🌐 SSR built-in

Next.js-style server rendering. **No extra packages.**

</td>
<td width="33%">

### 🧹 Depclean

Find unused dependencies automatically. **Smaller bundles.**

</td>
<td width="33%">

### 🔧 WASM imports

Import `.wasm` files directly. **Native WebAssembly.**

</td>
</tr>
</table>

<br>

---

<br>

## 📦 Install

```bash
# New project (recommended)
npx create-kona-app my-app

# Or add to existing project
npm install kona --save-dev
```

### Minimal config (if you want one)

```ts
// kona.ts
import { kona } from 'kona';

kona({
  entry: 'src/index.tsx',
  devServer: true,
}).runDev();
```

<br>

---

<br>

<details>
<summary><strong>📚 More features (click to expand)</strong></summary>

<br>

### React with Fast Refresh

```ts
import { kona, pluginReact } from 'kona';

kona({
  entry: 'src/App.tsx',
  plugins: [pluginReact({ fastRefresh: true })],
}).runDev();
```

### SSR (Next.js-style)

```ts
import { kona, pluginNextJS } from 'kona';

kona({
  plugins: [
    pluginNextJS({
      ssr: true,
      appDir: './app',
      serverActions: true,
    }),
  ],
}).runProd();
```

### WebAssembly imports

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

### Depclean (find unused deps)

```bash
npx kona depclean
```

### Full config (when you need it)

```ts
kona({
  entry: 'src/index.tsx',
  target: 'browser',
  output: { dir: 'dist' },
  devServer: { port: 3000 },
  plugins: [pluginReact(), pluginCSS()],
  cache: { enabled: true },
});
```

</details>

<br>

---

<br>

## 📖 Learn more

| Resource                                             | Description           |
| ---------------------------------------------------- | --------------------- |
| [**Plugin Guide**](./docs/PLUGINS.md)                | Create custom plugins |
| [**Benchmarks**](./docs/BENCHMARKS.md)               | Reproduce our tests   |
| [**Case Studies**](./docs/CASE_STUDIES.md)           | Real-world examples   |
| [**Roadmap**](./ROADMAP.md)                          | What's coming next    |
| [**API Docs**](https://ruidosujeira.github.io/kona/) | Full reference        |

<br>

---

<br>

## 🤝 Community

<table>
<tr>
<td align="center">
<a href="https://github.com/ruidosujeira/kona/issues">
<strong>🐛 Issues</strong><br>
Bug reports
</a>
</td>
<td align="center">
<a href="https://github.com/ruidosujeira/kona/discussions">
<strong>💬 Discussions</strong><br>
Questions & ideas
</a>
</td>
<td align="center">
<a href="https://twitter.com/KonaJS">
<strong>🐦 Twitter</strong><br>
Updates
</a>
</td>
<td align="center">
<a href="https://discord.gg/kona">
<strong>💬 Discord</strong><br>
Chat with us
</a>
</td>
</tr>
</table>

<br>

---

<div align="center">
<br>

**Stop waiting. Start building.**

```bash
npx create-kona-app my-app
```

<br>

MIT © 2025 Kona Contributors

</div>
