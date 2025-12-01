// JavaScript extensions - ESM (.mjs) and CommonJS (.cjs) support
export const JS_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs'];
export const ESM_EXTENSIONS = ['.mjs', '.js']; // Extensions that default to ESM
export const CJS_EXTENSIONS = ['.cjs']; // Extensions that are always CommonJS

// TypeScript extensions - including .mts and .cts for ESM/CJS
export const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
export const TS_ESM_EXTENSIONS = ['.mts']; // TypeScript ESM
export const TS_CJS_EXTENSIONS = ['.cts']; // TypeScript CommonJS

// All executable extensions
export const EXECUTABLE_EXTENSIONS = [...JS_EXTENSIONS, ...TS_EXTENSIONS];

// Asset extensions
export const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2', '.eot'];
export const IMAGE_EXTENSIONS = ['.png', '.jpeg', '.jpg', '.gif', '.bmp', '.svg', '.webp', '.avif'];
export const ICO_EXTENSIONS = ['.ico'];
export const STYLESHEET_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.styl'];
export const DOCUMENT_EXTENSIONS = ['.pdf'];
export const LINK_ASSUMPTION_EXTENSIONS = [
  ...FONT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ...ICO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
];
export const TEXT_EXTENSIONS = ['.md', '.txt', '.html', '.graphql'];
export const FTL_ELIGIBLE_EXTENSIONS = [...TEXT_EXTENSIONS, ...STYLESHEET_EXTENSIONS];

/**
 * Check if a file extension indicates ESM module
 */
export function isESMExtension(ext: string): boolean {
  return ESM_EXTENSIONS.includes(ext) || TS_ESM_EXTENSIONS.includes(ext);
}

/**
 * Check if a file extension indicates CommonJS module
 */
export function isCJSExtension(ext: string): boolean {
  return CJS_EXTENSIONS.includes(ext) || TS_CJS_EXTENSIONS.includes(ext);
}
