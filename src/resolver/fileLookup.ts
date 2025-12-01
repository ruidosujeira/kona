import * as fs from 'fs';
import * as path from 'path';
import { IRawCompilerOptions } from '../compilerOptions/interfaces';
import { parseTypescriptConfig } from '../compilerOptions/parseTypescriptConfig';
import { fileExists, readFile } from '../utils/utils';

export interface ILookupProps {
  fileDir?: string;
  filePath?: string;
  isBrowserBuild?: boolean;
  isDev?: boolean;
  javascriptFirst?: boolean;
  // the resolver used to find the subpath inside a package
  subPathResolver?: SubPathResolver;
  target: string;
  typescriptFirst?: boolean;
}

export interface TsConfigAtPath {
  absPath: string;
  compilerOptions: IRawCompilerOptions;
  tsconfigPath: string;
}

export interface TargetResolver {
  (lookupArgs: ILookupProps): ILookupResult | undefined;
}

export interface SubPathResolver {
  (modulePath: string, subPath: string, type?: 'file' | 'dir' | 'exists', props?: Partial<ILookupResult>):
    | ILookupResult
    | undefined;
}

export interface ILookupResult {
  absPath: string;
  customIndex?: boolean;
  extension?: string;
  fileExists: boolean;
  isDirectoryIndex?: boolean;
  // TODO: not used?
  monorepoModulesPaths?: string;
  tsConfigAtPath?: TsConfigAtPath;
}

// ESM-first extension order for modern module resolution
const JS_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs'];
const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

// Modern ESM-first resolution order
const TS_EXTENSIONS_FIRST = [...TS_EXTENSIONS, ...JS_EXTENSIONS];
const JS_EXTENSIONS_FIRST = [...JS_EXTENSIONS, ...TS_EXTENSIONS];

// ESM-specific extensions for package.json exports resolution
// Used by resolvePackageExports for conditional resolution
const _ESM_EXTENSIONS = ['.mjs', '.mts'];
const _CJS_EXTENSIONS = ['.cjs', '.cts'];

/**
 * Check if file is ESM based on extension
 */
export function isESMFile(filePath: string): boolean {
  return _ESM_EXTENSIONS.some(ext => filePath.endsWith(ext));
}

/**
 * Check if file is CJS based on extension
 */
export function isCJSFile(filePath: string): boolean {
  return _CJS_EXTENSIONS.some(ext => filePath.endsWith(ext));
}

function isFileSync(path: string): boolean {
  return fileExists(path) && fs.lstatSync(path).isFile();
}

// A SubPathResolver that simply checks the actual filesystem
export const resolveIfExists: SubPathResolver = (base, target = '', type, props = {}) => {
  const absPath = path.join(base, target);
  switch (type) {
    case 'dir':
      return (
        (fileExists(absPath) &&
          fs.lstatSync(absPath).isDirectory() && {
            absPath,
            extension: path.extname(absPath),
            fileExists: true,
            ...props,
          }) ||
        undefined
      );
    case 'exists':
    case undefined:
      return (
        (fileExists(absPath) && { absPath, extension: path.extname(absPath), fileExists: true, ...props }) || undefined
      );
    case 'file':
      return (
        (fileExists(absPath) &&
          fs.lstatSync(absPath).isFile() && {
            absPath,
            extension: path.extname(absPath),
            fileExists: true,
            ...props,
          }) ||
        undefined
      );
    default:
      // never
      return undefined;
  }
};

export function fileLookup(props: ILookupProps): ILookupResult {
  if (!props.fileDir && !props.filePath) {
    throw new Error('Failed to lookup. Provide either fileDir or filePath');
  }
  const jsFirst = props.javascriptFirst && !props.typescriptFirst;
  const base = path.normalize(props.filePath ? path.dirname(props.filePath) : props.fileDir);
  const subpathResolver = props.subPathResolver || resolveIfExists;
  const target = props.target && path.normalize(props.target);
  return resolveSubmodule(base, target, subpathResolver, true, jsFirst, props.isBrowserBuild);
}

function resolveSubmodule(
  base: string,
  target: string,
  resolveSubpath: SubPathResolver,
  checkPackage: boolean,
  jsFirst: boolean,
  isBrowserBuild: boolean,
) {
  // If an exact file exists, return it
  const exactFile = resolveSubpath(base, target, 'file');
  if (exactFile) {
    return exactFile;
  }

  // If a file exists after adding an extension, return it
  const extensions = jsFirst ? JS_EXTENSIONS_FIRST : TS_EXTENSIONS_FIRST;
  for (const extension of extensions) {
    const withExtension = resolveSubpath(base, `${target}${extension}`, 'file');
    if (withExtension) {
      return withExtension;
    }
  }

  // If we should check for a package.json, do that
  // We don't always check because we might be here by following the "main" field from a previous package.json
  // and no further package.json files should be followed after that
  if (checkPackage) {
    const packageJSONPath = path.join(base, target, 'package.json');
    if (isFileSync(packageJSONPath)) {
      const packageJSON = JSON.parse(readFile(packageJSONPath));

      if (isBrowserBuild && packageJSON['browser'] && typeof packageJSON['browser'] === 'string') {
        const browser = path.join(target, packageJSON['browser']);
        const subresolution = resolveSubmodule(base, browser, resolveSubpath, false, jsFirst, isBrowserBuild);
        return subresolution;
      }

      // NOTE: the implementation of "local:main" has a couple of flaws
      //         1. the isLocal test is fragile and won't work in Yarn 2
      //         2. it is incorrect to simply assume that the tsconfig at the root of the package is the right one
      //       a more robust solution would be to use tsconfig references which can map outputs to inputs
      //       and then you can just "main" instead of "local:main" and the output will be mapped to the input
      //       and tsconfig references also solve the "which tsconfig to use?" problem
      const isLocal = !/node_modules/.test(packageJSONPath);
      if (isLocal && packageJSON['local:main']) {
        const localMain = path.join(target, packageJSON['local:main']);
        const subresolution = resolveSubmodule(base, localMain, resolveSubpath, false, jsFirst, isBrowserBuild);

        // TODO: not used?
        const submodules = path.resolve(base, path.join(target, 'node_modules'));
        const monorepoModulesPaths = fileExists(submodules) ? submodules : undefined;

        return {
          ...subresolution,
          customIndex: true,
          isDirectoryIndex: true,
          // TODO: not used?
          monorepoModulesPaths,
          tsConfigAtPath: loadTsConfig(path.join(base, target)),
        };
      }

      if (packageJSON['ts:main']) {
        const tsMain = path.join(target, packageJSON['ts:main']);
        const subresolution = resolveSubmodule(base, tsMain, resolveSubpath, false, jsFirst, isBrowserBuild);
        if (subresolution.fileExists) {
          return {
            ...subresolution,
            customIndex: true,
            isDirectoryIndex: true,
          };
        }
      }

      if (packageJSON['module']) {
        const mod = path.join(target, packageJSON['module']);
        const subresolution = resolveSubmodule(base, mod, resolveSubpath, false, jsFirst, isBrowserBuild);
        if (subresolution.fileExists) {
          return {
            ...subresolution,
            customIndex: true,
            isDirectoryIndex: true,
          };
        }
      }

      if (packageJSON['main']) {
        const main = path.join(target, packageJSON['main']);
        const subresolution = resolveSubmodule(base, main, resolveSubpath, false, jsFirst, isBrowserBuild);
        if (subresolution.fileExists) {
          return {
            ...subresolution,
            customIndex: true,
            isDirectoryIndex: true,
          };
        }
      }

      // Modern ESM "exports" field resolution (Node.js 12.7+)
      // Supports conditional exports, subpath exports, and subpath patterns
      if (packageJSON['exports']) {
        const exportsResolved = resolvePackageExports(
          packageJSON['exports'],
          '.',
          isBrowserBuild ? 'browser' : 'node',
          target,
          base,
          resolveSubpath,
          jsFirst,
          isBrowserBuild
        );
        if (exportsResolved && exportsResolved.fileExists) {
          return {
            ...exportsResolved,
            customIndex: true,
            isDirectoryIndex: true,
          };
        }
      }

      // We do not look for index.js (etc.) here
      // Because we always look for those whether we are checking package.json or not
      // So that's done outside the if.
    }
  }

  // If an index file exists return it
  for (const extension of extensions) {
    const asIndex = resolveSubpath(base, path.join(target, `index${extension}`), 'file', {
      isDirectoryIndex: true,
    });
    if (asIndex) {
      return asIndex;
    }
  }

  const asJson = resolveSubpath(base, `${target}.json`, 'file', {
    customIndex: true,
  });
  if (asJson) {
    return asJson;
  }

  return {
    absPath: path.join(base, target),
    fileExists: false,
  };
}

/**
 * Resolve package.json "exports" field according to Node.js ESM resolution algorithm
 * Supports:
 * - Conditional exports (import, require, browser, node, default)
 * - Subpath exports
 * - Subpath patterns with wildcards
 */
function resolvePackageExports(
  exports: any,
  subpath: string,
  condition: 'browser' | 'node',
  target: string,
  base: string,
  resolveSubpath: SubPathResolver,
  jsFirst: boolean,
  isBrowserBuild: boolean
): ILookupResult | undefined {
  // Handle string exports (simple case)
  if (typeof exports === 'string') {
    const resolved = path.join(target, exports);
    return resolveSubmodule(base, resolved, resolveSubpath, false, jsFirst, isBrowserBuild);
  }

  // Handle array exports (fallback chain)
  if (Array.isArray(exports)) {
    for (const exp of exports) {
      const result = resolvePackageExports(exp, subpath, condition, target, base, resolveSubpath, jsFirst, isBrowserBuild);
      if (result && result.fileExists) {
        return result;
      }
    }
    return undefined;
  }

  // Handle object exports (conditional or subpath)
  if (typeof exports === 'object' && exports !== null) {
    const keys = Object.keys(exports);

    // Check if this is conditional exports (keys start with conditions like "import", "require", etc.)
    const isConditional = keys.some(k => ['import', 'require', 'browser', 'node', 'default', 'types', 'module'].includes(k));

    if (isConditional) {
      // Resolve conditional exports in priority order
      const conditions = isBrowserBuild
        ? ['browser', 'import', 'module', 'default', 'require']
        : ['node', 'import', 'module', 'require', 'default'];

      for (const cond of conditions) {
        if (exports[cond] !== undefined) {
          const result = resolvePackageExports(exports[cond], subpath, condition, target, base, resolveSubpath, jsFirst, isBrowserBuild);
          if (result && result.fileExists) {
            return result;
          }
        }
      }
      return undefined;
    }

    // Handle subpath exports
    if (subpath === '.') {
      // Look for "." entry first
      if (exports['.'] !== undefined) {
        return resolvePackageExports(exports['.'], '.', condition, target, base, resolveSubpath, jsFirst, isBrowserBuild);
      }
    }

    // Handle subpath patterns (e.g., "./*", "./lib/*")
    for (const key of keys) {
      if (key.includes('*')) {
        const pattern = key.replace('*', '(.*)');
        const regex = new RegExp(`^${pattern}$`);
        const match = subpath.match(regex);
        if (match && match[1]) {
          const replacement = exports[key];
          if (typeof replacement === 'string') {
            const resolved = path.join(target, replacement.replace('*', match[1]));
            const result = resolveSubmodule(base, resolved, resolveSubpath, false, jsFirst, isBrowserBuild);
            if (result && result.fileExists) {
              return result;
            }
          }
        }
      } else if (key === subpath) {
        return resolvePackageExports(exports[key], subpath, condition, target, base, resolveSubpath, jsFirst, isBrowserBuild);
      }
    }
  }

  return undefined;
}

function loadTsConfig(packageDir: string) {
  const tsConfig = path.resolve(packageDir, 'tsconfig.json');
  if (isFileSync(tsConfig)) {
    const tsConfigParsed = parseTypescriptConfig(tsConfig);
    if (!tsConfigParsed.error) {
      return {
        absPath: packageDir,
        compilerOptions: tsConfigParsed.config.compilerOptions,
        tsconfigPath: tsConfig,
      };
    }
  }
}
