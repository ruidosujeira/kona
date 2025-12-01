import { ITarget } from '../config/ITarget';
import { readFile } from '../utils/utils';

export const BUNDLE_RUNTIME_NAMES = {
  ARG_REQUIRE_FUNCTION: '__fusereq',
  BUNDLE_FUNCTION: 'bundle',
  CACHE_MODULES: 'c',
  GLOBAL_OBJ: '__fuse',
  INTEROP_REQUIRE_DEFAULT_FUNCTION: 'dt',
  MODULE_COLLECTION: 'modules',
  REQUIRE_FUNCTION: 'r',
  // ESM-specific
  DYNAMIC_IMPORT: 'di',
  IMPORT_META: 'meta',
  ESM_INTEROP: 'esm',
};

export function createGlobalModuleCall(moduleId: number) {
  const fn = BUNDLE_RUNTIME_NAMES.GLOBAL_OBJ + '.' + BUNDLE_RUNTIME_NAMES.REQUIRE_FUNCTION;
  return fn + '(' + moduleId + ');';
}

export type ICodeSplittingMap = {
  b: Record<number, { p: string; s?: string }>;
};

export interface IBundleRuntimeCore {
  codeSplittingMap?: ICodeSplittingMap;
  includeHMR?: boolean;
  interopRequireDefault?: boolean;
  isIsolated?: boolean;
  target: ITarget;
  typescriptHelpersPath?: string;
}

const INTEROP_DEFAULT = BUNDLE_RUNTIME_NAMES.INTEROP_REQUIRE_DEFAULT_FUNCTION;

function getCodeSplittingFunction(target: ITarget) {
  if (target === 'browser' || target==='electron') {
    return `function lb(id, conf) {
  return new Promise(function(resolve, reject) {
    if (!conf.fns) {
      conf.fns = [resolve];
      function loadJS(){
        var script = document.createElement('script');
        document.head.appendChild(script);
        script.onload = function() {
          if (modules[id]) {
            conf.fns.map(function(x) {
              return x(f.r(id));
            });
          } else reject('Resolve error of module ' + id + ' at path ' + conf.p);
          conf.fns = void 0;
        };
        script.src = conf.p;
      }
      if( conf.s ){
        var link = document.createElement('link');
        link.rel = "stylesheet";
        link.onload = loadJS;
        link.href = conf.s
        document.head.appendChild(link);
      } else loadJS();
    } else conf.fns.push(resolve);
  });
}`;
  }
  if (target === 'server') {
    return `function lb(id, conf) {
return new Promise(function(resolve, reject) {
  require(require('path').join(__dirname, conf.p));
if (modules[id]) {
  return resolve(f.r(id));
} else reject('Resolve error of module ' + id + ' at path ' + conf.p);
});
};`;
  }
  return '';
}

export function bundleRuntimeCore(props: IBundleRuntimeCore) {
  const { target } = props;
  const isIsolated = props.target === 'web-worker' || props.isIsolated;
  let coreVariable;
  // web-worker cannot share anything with bundle, hence it gets an isolated mode
  if (isIsolated) {
    coreVariable = `var f = {};`;
  } else if (target === 'browser' || target === 'electron') {
    // storing directly to browser window object
    coreVariable = `var f = window.${BUNDLE_RUNTIME_NAMES.GLOBAL_OBJ} = window.${BUNDLE_RUNTIME_NAMES.GLOBAL_OBJ} || {};`;
  } else if (target === 'server') {
    // storing to global object
    coreVariable = `var f = global.${BUNDLE_RUNTIME_NAMES.GLOBAL_OBJ} = global.${BUNDLE_RUNTIME_NAMES.GLOBAL_OBJ} || {};`;
  }

  let optional = '';
  if (props.interopRequireDefault) {
    optional += `f.${INTEROP_DEFAULT} = function (x) { return x && x.__esModule ? x : { "default": x }; };\n`;
  }
  if (props.codeSplittingMap) {
    optional += `\nvar cs = ${JSON.stringify(props.codeSplittingMap)};`;
    optional += '\n' + getCodeSplittingFunction(props.target);
  }

  if (props.includeHMR) {
    optional += '\nf.modules = modules;';
  }

  // ESM interop helpers
  const esmHelpers = `
  // ESM interop
  f.${BUNDLE_RUNTIME_NAMES.ESM_INTEROP} = function(m) { return m && m.__esModule ? m : { "default": m }; };
  f.exportAll = function(s, t) { Object.keys(s).forEach(function(k) { if (k !== "default" && k !== "__esModule") Object.defineProperty(t, k, { enumerable: true, get: function() { return s[k]; } }); }); };
  // Dynamic import support
  f.${BUNDLE_RUNTIME_NAMES.DYNAMIC_IMPORT} = function(id) {
    return new Promise(function(resolve, reject) {
      try {
        if (modules[id]) return resolve(f.r(id));
        ${props.codeSplittingMap ? 'var s = cs.b[id]; if (s) return lb(id, s).then(function() { resolve(f.r(id)); }).catch(reject);' : ''}
        reject(new Error('Module ' + id + ' not found'));
      } catch(e) { reject(e); }
    });
  };
  // import.meta support
  f.${BUNDLE_RUNTIME_NAMES.IMPORT_META} = function(id, path) {
    ${target === 'browser' || target === 'electron' 
      ? `var base = document.baseURI || location.href;
    return { url: new URL(path, base).href, resolve: function(s) { return new URL(s, base).href; } };`
      : `var p = require('path'), u = require('url');
    var abs = p.resolve(__dirname, path);
    return { url: u.pathToFileURL(abs).href, dirname: p.dirname(abs), filename: abs };`}
  };`;

  let CODE = `${isIsolated ? `var ${BUNDLE_RUNTIME_NAMES.GLOBAL_OBJ} = ` : ''}(function() {
  ${coreVariable}
  var modules = f.modules = f.modules || {}; ${optional}${esmHelpers}
  f.${BUNDLE_RUNTIME_NAMES.BUNDLE_FUNCTION} = function(collection, fn) {
    for (var num in collection) {
      modules[num] = collection[num];
    }
    fn ? fn() : void 0;
  };
  f.c = {};
  f.${BUNDLE_RUNTIME_NAMES.REQUIRE_FUNCTION} = function(id) {
    var cached = f.c[id];
    if (cached) return cached.m.exports;
    var module = modules[id];
    if (!module) {
      ${props.codeSplittingMap ? 'var s = cs.b[id]; if (s) return lb(id, s);' : ''}
      throw new Error('Module ' + id + ' was not found');
    }
    cached = f.c[id] = {};
    cached.exports = {};
    cached.m = { exports: cached.exports };
    module(f.${BUNDLE_RUNTIME_NAMES.REQUIRE_FUNCTION}, cached.exports, cached.m);
    return cached.m.exports;
  }; ${isIsolated ? '\n\treturn f;' : ''}
})();`;

  if (props.typescriptHelpersPath) {
    const tsHelperContents = readFile(props.typescriptHelpersPath);
    CODE += '\n' + tsHelperContents;
  }

  return CODE;
}
