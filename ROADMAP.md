# Kona Roadmap

Public roadmap for Kona bundler development.

## Legend

- ✅ Completed
- 🚧 In Progress
- 📋 Planned
- 💡 Under Consideration

---

## Q4 2024 - Foundation

### Core Features ✅

- [x] TypeScript 5+ support with native decorators
- [x] Full ESM support (import.meta, dynamic imports, top-level await)
- [x] WebAssembly module imports
- [x] Rust/WASM optimizer for tree-shaking
- [x] Enhanced HMR with state preservation
- [x] React Fast Refresh integration
- [x] Next.js-style SSR plugin
- [x] Depclean mode for unused dependencies
- [x] New CLI with benchmark command

### Documentation ✅

- [x] README rewrite for 2025
- [x] Plugin development guide
- [x] Reproducible benchmarks
- [x] TypeDoc API documentation

---

## Q1 2025 - Performance & DX

### Performance 🚧

- [ ] Incremental builds with persistent cache
- [ ] Parallel module resolution
- [ ] Lazy compilation for dev mode
- [ ] Smarter chunk splitting algorithm
- [ ] Memory-mapped file reading

### Developer Experience 📋

- [ ] Zero-config mode for common frameworks
- [ ] Interactive CLI wizard (`kona create`)
- [ ] VS Code extension with IntelliSense
- [ ] Error overlay improvements
- [ ] Build time visualization

### Plugins 📋

- [ ] Vue 3 plugin with SFC support
- [ ] Svelte plugin
- [ ] Solid.js plugin
- [ ] MDX plugin
- [ ] CSS Modules improvements

---

## Q2 2025 - Ecosystem

### Framework Support 📋

- [ ] Remix adapter
- [ ] Astro integration
- [ ] Nuxt.js compatibility
- [ ] SvelteKit adapter
- [ ] Qwik support

### Build Features 📋

- [ ] Module federation
- [ ] Micro-frontends support
- [ ] Build caching (remote cache)
- [ ] Differential builds (modern/legacy)
- [ ] Asset pipeline improvements

### Testing 📋

- [ ] Built-in test runner
- [ ] Coverage reporting
- [ ] Snapshot testing
- [ ] Component testing utilities

---

## Q3 2025 - Enterprise

### Monorepo Support 📋

- [ ] Workspace-aware builds
- [ ] Dependency graph visualization
- [ ] Affected module detection
- [ ] Parallel workspace builds
- [ ] Shared cache across workspaces

### Enterprise Features 💡

- [ ] Remote caching service
- [ ] Build analytics dashboard
- [ ] Team collaboration features
- [ ] CI/CD optimizations
- [ ] Security scanning

### Cloud 💡

- [ ] Kona Cloud (hosted builds)
- [ ] Edge deployment support
- [ ] Serverless function bundling
- [ ] CDN integration

---

## Q4 2025 - Future

### Experimental 💡

- [ ] Native ESM output (no bundling)
- [ ] Import maps support
- [ ] Deno compatibility
- [ ] Bun runtime support
- [ ] Browser-native modules

### Performance 💡

- [ ] Full Rust rewrite (kona-rs)
- [ ] Native Node.js addon
- [ ] GPU-accelerated minification
- [ ] Distributed builds

---

## Version Milestones

### v4.1.0 (Current)

- ESM support
- WASM imports
- React/Next.js plugins
- Enhanced HMR

### v4.2.0 (Q1 2025)

- Incremental builds
- Vue/Svelte plugins
- Zero-config mode
- VS Code extension

### v4.3.0 (Q2 2025)

- Module federation
- Framework adapters
- Remote caching
- Test runner

### v5.0.0 (Q4 2025)

- Breaking changes cleanup
- Full Rust core (optional)
- Native ESM output
- Kona Cloud

---

## How to Contribute

### Priority Areas

1. **Performance** - Profiling and optimization
2. **Plugins** - Framework integrations
3. **Documentation** - Guides and examples
4. **Testing** - Test coverage

### Getting Started

```bash
git clone https://github.com/ruidosujeira/kona.git
cd kona
npm install
npm test
```

### Propose Features

1. Open a [GitHub Discussion](https://github.com/ruidosujeira/kona/discussions)
2. Describe the use case
3. Provide examples if possible
4. Community feedback
5. RFC if accepted

---

## Community Requests

Features requested by the community (vote with 👍):

| Feature           | Votes | Status         |
| ----------------- | ----- | -------------- |
| Vue 3 SFC support | 45    | 📋 Q1 2025     |
| Module federation | 38    | 📋 Q2 2025     |
| Svelte plugin     | 32    | 📋 Q1 2025     |
| Remote caching    | 28    | 📋 Q2 2025     |
| Deno support      | 22    | 💡 Considering |
| Native ESM output | 18    | 💡 Considering |

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## Feedback

- [GitHub Issues](https://github.com/ruidosujeira/kona/issues) - Bug reports
- [GitHub Discussions](https://github.com/ruidosujeira/kona/discussions) - Feature requests
- [Twitter](https://twitter.com/KonaJS) - Updates

---

_Last updated: December 2024_
