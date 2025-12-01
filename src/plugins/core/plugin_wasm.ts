/**
 * WebAssembly Plugin for Kona Bundler
 *
 * Provides native support for importing .wasm files directly:
 *
 * ```ts
 * // Sync import (instantiates immediately)
 * import wasmModule from './module.wasm';
 *
 * // Async import with imports object
 * import initWasm from './module.wasm?init';
 * const instance = await initWasm({ env: { memory: new WebAssembly.Memory({ initial: 1 }) } });
 *
 * // Raw bytes import
 * import wasmBytes from './module.wasm?bytes';
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { Context } from '../../core/context';
import { IModule } from '../../moduleResolver/module';
import { fastHash, fileExists, joinFuseBoxPath } from '../../utils/utils';
import { parsePluginOptions } from '../pluginUtils';

export interface IPluginWasmOptions {
  /** Public path for WASM files */
  publicPath?: string;
  /** Whether to inline small WASM files as base64 */
  inline?: boolean;
  /** Max size in bytes for inlining (default: 4096) */
  inlineLimit?: number;
  /** Use default export */
  useDefault?: boolean;
  /** Enable streaming compilation when available */
  streaming?: boolean;
  /** Custom fetch options for streaming */
  fetchOptions?: Record<string, unknown>;
}

/**
 * Generate WASM loader code based on import type
 */
function generateWasmLoader(
  wasmPath: string,
  options: IPluginWasmOptions,
  importType: 'default' | 'init' | 'bytes',
  inlineData?: string
): string {
  const useDefault = options.useDefault !== false;
  const streaming = options.streaming !== false;

  if (importType === 'bytes') {
    // Return raw bytes as Uint8Array
    if (inlineData) {
      const code = `
(function() {
  var base64 = "${inlineData}";
  var binary = typeof atob === 'function' 
    ? atob(base64) 
    : Buffer.from(base64, 'base64').toString('binary');
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  ${useDefault ? 'module.exports.default = bytes; module.exports.__esModule = true;' : 'module.exports = bytes;'}
})();`;
      return code;
    }

    // Fetch bytes at runtime
    const code = `
(function() {
  var wasmPath = ${JSON.stringify(wasmPath)};
  var bytesPromise = typeof fetch === 'function'
    ? fetch(wasmPath).then(function(r) { return r.arrayBuffer(); }).then(function(b) { return new Uint8Array(b); })
    : Promise.resolve(require('fs').readFileSync(require('path').resolve(__dirname, wasmPath)));
  ${useDefault ? 'module.exports.default = bytesPromise; module.exports.__esModule = true;' : 'module.exports = bytesPromise;'}
})();`;
    return code;
  }

  if (importType === 'init') {
    // Return init function that accepts imports
    if (inlineData) {
      const code = `
(function() {
  var base64 = "${inlineData}";
  
  function decodeBase64(str) {
    if (typeof atob === 'function') {
      var binary = atob(str);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
    return Buffer.from(str, 'base64').buffer;
  }
  
  function initWasm(imports) {
    imports = imports || {};
    var buffer = decodeBase64(base64);
    return WebAssembly.instantiate(buffer, imports).then(function(result) {
      return result.instance;
    });
  }
  
  initWasm.module = function(imports) {
    imports = imports || {};
    var buffer = decodeBase64(base64);
    return WebAssembly.instantiate(buffer, imports);
  };
  
  ${useDefault ? 'module.exports.default = initWasm; module.exports.__esModule = true;' : 'module.exports = initWasm;'}
})();`;
      return code;
    }

    // Fetch and instantiate with imports
    const code = `
(function() {
  var wasmPath = ${JSON.stringify(wasmPath)};
  
  function initWasm(imports) {
    imports = imports || {};
    ${streaming ? `
    if (typeof WebAssembly.instantiateStreaming === 'function' && typeof fetch === 'function') {
      return WebAssembly.instantiateStreaming(fetch(wasmPath), imports)
        .then(function(result) { return result.instance; })
        .catch(function() {
          // Fallback for servers that don't serve correct MIME type
          return fetch(wasmPath)
            .then(function(r) { return r.arrayBuffer(); })
            .then(function(bytes) { return WebAssembly.instantiate(bytes, imports); })
            .then(function(result) { return result.instance; });
        });
    }` : ''}
    
    if (typeof fetch === 'function') {
      return fetch(wasmPath)
        .then(function(r) { return r.arrayBuffer(); })
        .then(function(bytes) { return WebAssembly.instantiate(bytes, imports); })
        .then(function(result) { return result.instance; });
    }
    
    // Node.js fallback
    var fs = require('fs');
    var path = require('path');
    var buffer = fs.readFileSync(path.resolve(__dirname, wasmPath));
    return WebAssembly.instantiate(buffer, imports).then(function(result) {
      return result.instance;
    });
  }
  
  initWasm.module = function(imports) {
    imports = imports || {};
    if (typeof fetch === 'function') {
      return fetch(wasmPath)
        .then(function(r) { return r.arrayBuffer(); })
        .then(function(bytes) { return WebAssembly.instantiate(bytes, imports); });
    }
    var fs = require('fs');
    var path = require('path');
    var buffer = fs.readFileSync(path.resolve(__dirname, wasmPath));
    return WebAssembly.instantiate(buffer, imports);
  };
  
  ${useDefault ? 'module.exports.default = initWasm; module.exports.__esModule = true;' : 'module.exports = initWasm;'}
})();`;
    return code;
  }

  // Default: auto-instantiate with empty imports
  if (inlineData) {
    const code = `
(function() {
  var base64 = "${inlineData}";
  var wasmInstance = null;
  var wasmExports = null;
  
  function decodeBase64(str) {
    if (typeof atob === 'function') {
      var binary = atob(str);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
    return Buffer.from(str, 'base64').buffer;
  }
  
  var buffer = decodeBase64(base64);
  var initPromise = WebAssembly.instantiate(buffer, {}).then(function(result) {
    wasmInstance = result.instance;
    wasmExports = result.instance.exports;
    return wasmExports;
  });
  
  // Proxy that waits for initialization
  var proxy = {
    then: function(resolve, reject) { return initPromise.then(resolve, reject); },
    catch: function(reject) { return initPromise.catch(reject); },
    get instance() { return wasmInstance; },
    get exports() { return wasmExports; },
    ready: initPromise
  };
  
  ${useDefault ? 'module.exports.default = proxy; module.exports.__esModule = true;' : 'module.exports = proxy;'}
})();`;
    return code;
  }

  // Fetch and auto-instantiate
  const code = `
(function() {
  var wasmPath = ${JSON.stringify(wasmPath)};
  var wasmInstance = null;
  var wasmExports = null;
  
  var initPromise;
  ${streaming ? `
  if (typeof WebAssembly.instantiateStreaming === 'function' && typeof fetch === 'function') {
    initPromise = WebAssembly.instantiateStreaming(fetch(wasmPath), {})
      .catch(function() {
        return fetch(wasmPath)
          .then(function(r) { return r.arrayBuffer(); })
          .then(function(bytes) { return WebAssembly.instantiate(bytes, {}); });
      });
  } else` : ''}
  if (typeof fetch === 'function') {
    initPromise = fetch(wasmPath)
      .then(function(r) { return r.arrayBuffer(); })
      .then(function(bytes) { return WebAssembly.instantiate(bytes, {}); });
  } else {
    // Node.js
    var fs = require('fs');
    var path = require('path');
    var buffer = fs.readFileSync(path.resolve(__dirname, wasmPath));
    initPromise = WebAssembly.instantiate(buffer, {});
  }
  
  initPromise = initPromise.then(function(result) {
    wasmInstance = result.instance;
    wasmExports = result.instance.exports;
    return wasmExports;
  });
  
  var proxy = {
    then: function(resolve, reject) { return initPromise.then(resolve, reject); },
    catch: function(reject) { return initPromise.catch(reject); },
    get instance() { return wasmInstance; },
    get exports() { return wasmExports; },
    ready: initPromise
  };
  
  ${useDefault ? 'module.exports.default = proxy; module.exports.__esModule = true;' : 'module.exports = proxy;'}
})();`;
  return code;
}

/**
 * Determine import type from query string
 */
function getImportType(absPath: string): 'default' | 'init' | 'bytes' {
  if (absPath.includes('?init')) return 'init';
  if (absPath.includes('?bytes')) return 'bytes';
  return 'default';
}

/**
 * Handler for WASM modules
 */
export function pluginWasmHandler(module: IModule, options: IPluginWasmOptions) {
  const ctx = module.ctx;
  const absPath = module.absPath.split('?')[0]; // Remove query string
  const importType = getImportType(module.absPath);

  module.captured = true;
  ctx.log.info('wasm', 'Captured $file with <bold>pluginWasm</bold> (type: $type)', {
    file: absPath,
    type: importType,
  });

  // Read WASM file
  const wasmBuffer = fs.readFileSync(absPath);
  const wasmSize = wasmBuffer.length;

  // Determine if we should inline
  const inlineLimit = options.inlineLimit ?? 4096;
  const shouldInline = options.inline !== false && wasmSize <= inlineLimit;

  let wasmPath: string;
  let inlineData: string | undefined;

  if (shouldInline) {
    // Inline as base64
    inlineData = wasmBuffer.toString('base64');
    ctx.log.info('wasm', 'Inlined WASM ($size bytes)', { size: wasmSize });
  } else {
    // Copy to output directory
    const resourceConfig = ctx.config.getResourceConfig();
    const publicRoot = options.publicPath || ctx.config.getPublicRoot();
    const hash = fastHash(absPath);
    const fileName = `${hash}.wasm`;

    wasmPath = joinFuseBoxPath(publicRoot, fileName);
    const destination = path.join(resourceConfig.resourceFolder, fileName);

    if (!fileExists(destination)) {
      ctx.taskManager.copyFile(absPath, destination);
    }

    ctx.log.info('wasm', 'Copied WASM to $dest ($size bytes)', {
      dest: wasmPath,
      size: wasmSize,
    });
  }

  // Generate loader code
  module.contents = generateWasmLoader(wasmPath, options, importType, inlineData);
}

/**
 * WebAssembly plugin
 *
 * @example
 * ```ts
 * fusebox({
 *   plugins: [
 *     pluginWasm({
 *       inline: true,
 *       inlineLimit: 8192,
 *       streaming: true,
 *     })
 *   ]
 * })
 * ```
 */
export function pluginWasm(a?: IPluginWasmOptions | RegExp | string, b?: IPluginWasmOptions) {
  const [opts, matcher] = parsePluginOptions<IPluginWasmOptions>(a, b, {
    inline: true,
    inlineLimit: 4096,
    streaming: true,
    useDefault: true,
  });

  return (ctx: Context) => {
    ctx.ict.on('bundle_resolve_module', props => {
      const modulePath = props.module.absPath.split('?')[0];

      // Check if it's a WASM file
      if (!props.module.captured && modulePath.endsWith('.wasm')) {
        // Apply matcher if provided
        if (matcher && !matcher.test(modulePath)) {
          return props;
        }

        pluginWasmHandler(props.module, opts);
      }
      return props;
    });
  };
}

export default pluginWasm;
