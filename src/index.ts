export { initCommonTransform as testTransform } from './compiler/testUtils';
export { BASE_TRANSFORMERS as coreTransformerList } from './compiler/transformer';

// Main bundler function
export { kona } from './core/kona';
// Backwards compatibility alias
export { kona as fusebox } from './core/kona';

// Core plugins
export { pluginAngular } from './plugins/core/plugin_angular';
export { pluginConsolidate } from './plugins/core/plugin_consolidate';
export { pluginCSS } from './plugins/core/plugin_css';
export { pluginCSSInJSX } from './plugins/core/plugin_css_in_jsx';
export { pluginCustomTransform } from './plugins/core/plugin_customtransform';
export { pluginJSON } from './plugins/core/plugin_json';
export { pluginLess } from './plugins/core/plugin_less';
export { pluginLink } from './plugins/core/plugin_link';
export { pluginMinifyHtmlLiterals } from './plugins/core/plugin_minify_html_literals';
export { pluginPostCSS } from './plugins/core/plugin_postcss';
export { pluginRaw } from './plugins/core/plugin_raw';
export { pluginReplace } from './plugins/core/plugin_replace';
export { pluginSass } from './plugins/core/plugin_sass';
export { pluginStylus } from './plugins/core/plugin_stylus';
export { pluginWebWorker } from './plugins/webworker/plugin_web_worker';

// WebAssembly plugin
export { pluginWasm } from './plugins/core/plugin_wasm';

// React plugin (Fast Refresh, JSX runtime)
export { pluginReact } from './plugins/core/plugin_react';
export type { IPluginReactOptions } from './plugins/core/plugin_react';

// Next.js plugin (SSR, App Router, Server Actions)
export { pluginNextJS } from './plugins/core/plugin_nextjs';
export type { IPluginNextJSOptions } from './plugins/core/plugin_nextjs';

// Sparky task runner
export { sparky } from './sparky/sparky';

// Optimization utilities
export { createDepcleanPlugin, runDepclean } from './optimization/depclean';
export type { DepcleanConfig, DepcleanReport } from './optimization/depclean';

// Enhanced HMR
export { createEnhancedHMR } from './hmr/enhancedHMR';
export type { IEnhancedHMRConfig } from './hmr/enhancedHMR';

// ESM utilities
export * from './esm/index';
