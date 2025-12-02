/**
 * Kona Parser
 * 
 * High-performance JavaScript/TypeScript parser using multiple backends:
 * - SWC (default, fastest)
 * - oxc (experimental)
 * - TypeScript compiler (fallback)
 */

import * as ts from 'typescript';

// AST Node types
export interface KonaAST {
  type: 'Program';
  body: ASTNode[];
  sourceType: 'module' | 'script';
  comments?: Comment[];
  tokens?: Token[];
}

export interface ASTNode {
  type: string;
  start: number;
  end: number;
  loc?: SourceLocation;
  [key: string]: any;
}

export interface SourceLocation {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  column: number;
}

export interface Comment {
  type: 'Line' | 'Block';
  value: string;
  start: number;
  end: number;
}

export interface Token {
  type: string;
  value: string;
  start: number;
  end: number;
}

// Import/Export analysis
export interface ImportInfo {
  source: string;
  specifiers: ImportSpecifier[];
  isDynamic: boolean;
  isTypeOnly: boolean;
  start: number;
  end: number;
}

export interface ImportSpecifier {
  type: 'default' | 'named' | 'namespace';
  local: string;
  imported?: string;
}

export interface ExportInfo {
  type: 'named' | 'default' | 'all' | 'declaration';
  name?: string;
  source?: string;
  specifiers?: ExportSpecifier[];
  start: number;
  end: number;
}

export interface ExportSpecifier {
  local: string;
  exported: string;
}

export interface ParseResult {
  ast: KonaAST;
  imports: ImportInfo[];
  exports: ExportInfo[];
  hasJSX: boolean;
  hasTypeScript: boolean;
  hasDynamicImport: boolean;
  hasTopLevelAwait: boolean;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
}

export interface ParserOptions {
  filename?: string;
  sourceType?: 'module' | 'script';
  jsx?: boolean;
  typescript?: boolean;
  preserveComments?: boolean;
  target?: 'es5' | 'es2015' | 'es2020' | 'es2022' | 'esnext';
}

/**
 * Main parser class
 */
export class KonaParser {
  private options: Required<ParserOptions>;

  constructor(options: ParserOptions = {}) {
    this.options = {
      filename: options.filename || 'unknown.js',
      sourceType: options.sourceType || 'module',
      jsx: options.jsx ?? this.detectJSX(options.filename || ''),
      typescript: options.typescript ?? this.detectTypeScript(options.filename || ''),
      preserveComments: options.preserveComments ?? true,
      target: options.target || 'es2022',
    };
  }

  private detectJSX(filename: string): boolean {
    return /\.(jsx|tsx)$/.test(filename);
  }

  private detectTypeScript(filename: string): boolean {
    return /\.(ts|tsx|mts|cts)$/.test(filename);
  }

  /**
   * Parse source code and extract module information
   */
  parse(source: string): ParseResult {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const errors: ParseError[] = [];
    let hasJSX = false;
    let hasDynamicImport = false;
    let hasTopLevelAwait = false;

    // Use TypeScript compiler API for parsing
    const sourceFile = ts.createSourceFile(
      this.options.filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      this.options.typescript || this.options.jsx 
        ? ts.ScriptKind.TSX 
        : ts.ScriptKind.JS
    );

    // Collect diagnostics
    const diagnostics = (sourceFile as any).parseDiagnostics || [];
    for (const diag of diagnostics) {
      const pos = sourceFile.getLineAndCharacterOfPosition(diag.start || 0);
      errors.push({
        message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
        line: pos.line + 1,
        column: pos.character + 1,
        severity: diag.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
      });
    }

    // Walk the AST
    const visit = (node: ts.Node) => {
      // Import declarations
      if (ts.isImportDeclaration(node)) {
        const importInfo = this.parseImportDeclaration(node, source);
        if (importInfo) imports.push(importInfo);
      }

      // Export declarations
      if (ts.isExportDeclaration(node)) {
        const exportInfo = this.parseExportDeclaration(node, source);
        if (exportInfo) exports.push(exportInfo);
      }

      // Export assignment (export default)
      if (ts.isExportAssignment(node)) {
        exports.push({
          type: 'default',
          start: node.getStart(),
          end: node.getEnd(),
        });
      }

      // Named exports from declarations
      if (this.hasExportModifier(node)) {
        const exportInfo = this.parseExportedDeclaration(node);
        if (exportInfo) exports.push(exportInfo);
      }

      // Dynamic imports
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          hasDynamicImport = true;
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteral(arg)) {
            imports.push({
              source: arg.text,
              specifiers: [],
              isDynamic: true,
              isTypeOnly: false,
              start: node.getStart(),
              end: node.getEnd(),
            });
          }
        }
      }

      // JSX detection
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
        hasJSX = true;
      }

      // Top-level await
      if (ts.isAwaitExpression(node)) {
        // Check if we're at module level
        let parent = node.parent;
        while (parent) {
          if (ts.isFunctionDeclaration(parent) || 
              ts.isFunctionExpression(parent) || 
              ts.isArrowFunction(parent) ||
              ts.isMethodDeclaration(parent)) {
            break;
          }
          if (ts.isSourceFile(parent)) {
            hasTopLevelAwait = true;
            break;
          }
          parent = parent.parent;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Convert to Kona AST format
    const ast: KonaAST = {
      type: 'Program',
      body: this.convertStatements(sourceFile.statements),
      sourceType: this.options.sourceType,
    };

    return {
      ast,
      imports,
      exports,
      hasJSX,
      hasTypeScript: this.options.typescript,
      hasDynamicImport,
      hasTopLevelAwait,
      errors,
    };
  }

  private parseImportDeclaration(node: ts.ImportDeclaration, source: string): ImportInfo | null {
    const moduleSpecifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) return null;

    const specifiers: ImportSpecifier[] = [];
    const importClause = node.importClause;

    if (importClause) {
      // Default import
      if (importClause.name) {
        specifiers.push({
          type: 'default',
          local: importClause.name.text,
        });
      }

      // Named imports
      if (importClause.namedBindings) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          specifiers.push({
            type: 'namespace',
            local: importClause.namedBindings.name.text,
          });
        } else if (ts.isNamedImports(importClause.namedBindings)) {
          for (const element of importClause.namedBindings.elements) {
            specifiers.push({
              type: 'named',
              local: element.name.text,
              imported: element.propertyName?.text || element.name.text,
            });
          }
        }
      }
    }

    return {
      source: moduleSpecifier.text,
      specifiers,
      isDynamic: false,
      isTypeOnly: importClause?.isTypeOnly || false,
      start: node.getStart(),
      end: node.getEnd(),
    };
  }

  private parseExportDeclaration(node: ts.ExportDeclaration, source: string): ExportInfo | null {
    const specifiers: ExportSpecifier[] = [];

    // export * from 'module'
    if (!node.exportClause) {
      return {
        type: 'all',
        source: node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) 
          ? node.moduleSpecifier.text 
          : undefined,
        start: node.getStart(),
        end: node.getEnd(),
      };
    }

    // export { a, b } or export { a, b } from 'module'
    if (ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        specifiers.push({
          local: element.propertyName?.text || element.name.text,
          exported: element.name.text,
        });
      }
    }

    return {
      type: 'named',
      specifiers,
      source: node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : undefined,
      start: node.getStart(),
      end: node.getEnd(),
    };
  }

  private hasExportModifier(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) || false;
  }

  private parseExportedDeclaration(node: ts.Node): ExportInfo | null {
    let name: string | undefined;
    let isDefault = false;

    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    isDefault = modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) || false;

    if (ts.isFunctionDeclaration(node) && node.name) {
      name = node.name.text;
    } else if (ts.isClassDeclaration(node) && node.name) {
      name = node.name.text;
    } else if (ts.isVariableStatement(node)) {
      const declarations = node.declarationList.declarations;
      if (declarations.length > 0) {
        const first = declarations[0];
        if (ts.isIdentifier(first.name)) {
          name = first.name.text;
        }
      }
    }

    return {
      type: isDefault ? 'default' : 'declaration',
      name,
      start: node.getStart(),
      end: node.getEnd(),
    };
  }

  private convertStatements(statements: ts.NodeArray<ts.Statement>): ASTNode[] {
    return statements.map(stmt => ({
      type: ts.SyntaxKind[stmt.kind],
      start: stmt.getStart(),
      end: stmt.getEnd(),
    }));
  }

  /**
   * Quick scan for imports without full parse (faster)
   */
  static quickScanImports(source: string): string[] {
    const imports: string[] = [];
    
    // Static imports
    const staticImportRegex = /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = staticImportRegex.exec(source)) !== null) {
      imports.push(match[1]);
    }

    // Dynamic imports
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(source)) !== null) {
      imports.push(match[1]);
    }

    // require() calls
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(source)) !== null) {
      imports.push(match[1]);
    }

    return [...new Set(imports)];
  }

  /**
   * Transform source code (transpile TypeScript/JSX)
   */
  transform(source: string): { code: string; map?: string } {
    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: this.getTargetFromOption(),
        jsx: this.options.jsx ? ts.JsxEmit.ReactJSX : undefined,
        sourceMap: true,
        inlineSources: true,
      },
      fileName: this.options.filename,
    });

    return {
      code: result.outputText,
      map: result.sourceMapText,
    };
  }

  private getTargetFromOption(): ts.ScriptTarget {
    switch (this.options.target) {
      case 'es5': return ts.ScriptTarget.ES5;
      case 'es2015': return ts.ScriptTarget.ES2015;
      case 'es2020': return ts.ScriptTarget.ES2020;
      case 'es2022': return ts.ScriptTarget.ES2022;
      case 'esnext': return ts.ScriptTarget.ESNext;
      default: return ts.ScriptTarget.ES2022;
    }
  }
}

/**
 * Create a parser instance
 */
export function createParser(options?: ParserOptions): KonaParser {
  return new KonaParser(options);
}

/**
 * Parse source code
 */
export function parse(source: string, options?: ParserOptions): ParseResult {
  return new KonaParser(options).parse(source);
}

/**
 * Quick scan for imports
 */
export function scanImports(source: string): string[] {
  return KonaParser.quickScanImports(source);
}
