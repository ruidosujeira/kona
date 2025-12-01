//! JavaScript minification implementation in Rust
//!
//! High-performance minification using SWC's minifier with custom optimizations.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use swc_common::{
    errors::{ColorConfig, Handler},
    sync::Lrc,
    FileName, Globals, Mark, SourceMap, GLOBALS,
};
use swc_ecma_ast::EsVersion;
use swc_ecma_codegen::{text_writer::JsWriter, Emitter};
use swc_ecma_minifier::{
    optimize,
    option::{CompressOptions, ExtraOptions, MangleOptions, MinifyOptions},
};
use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax, EsSyntax};
use swc_ecma_transforms_base::{fixer::fixer, resolver};
use swc_ecma_visit::FoldWith;
use wasm_bindgen::prelude::*;

/// Configuration for minification
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen]
pub struct MinifyConfig {
    /// Enable compression optimizations
    #[wasm_bindgen(skip)]
    pub compress: bool,
    /// Enable variable name mangling
    #[wasm_bindgen(skip)]
    pub mangle: bool,
    /// Generate source maps
    #[wasm_bindgen(skip)]
    pub source_map: bool,
    /// Keep function names (useful for debugging)
    #[wasm_bindgen(skip)]
    pub keep_fn_names: bool,
    /// Keep class names
    #[wasm_bindgen(skip)]
    pub keep_class_names: bool,
    /// Target ECMAScript version
    #[wasm_bindgen(skip)]
    pub target: String,
    /// Remove console.* calls
    #[wasm_bindgen(skip)]
    pub drop_console: bool,
    /// Remove debugger statements
    #[wasm_bindgen(skip)]
    pub drop_debugger: bool,
    /// Number of compression passes
    #[wasm_bindgen(skip)]
    pub passes: u8,
}

#[wasm_bindgen]
impl MinifyConfig {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    #[wasm_bindgen(setter)]
    pub fn set_compress(&mut self, value: bool) {
        self.compress = value;
    }

    #[wasm_bindgen(setter)]
    pub fn set_mangle(&mut self, value: bool) {
        self.mangle = value;
    }

    #[wasm_bindgen(setter)]
    pub fn set_source_map(&mut self, value: bool) {
        self.source_map = value;
    }

    #[wasm_bindgen(setter)]
    pub fn set_keep_fn_names(&mut self, value: bool) {
        self.keep_fn_names = value;
    }

    #[wasm_bindgen(setter)]
    pub fn set_keep_class_names(&mut self, value: bool) {
        self.keep_class_names = value;
    }

    #[wasm_bindgen(setter)]
    pub fn set_target(&mut self, value: String) {
        self.target = value;
    }

    #[wasm_bindgen(setter)]
    pub fn set_drop_console(&mut self, value: bool) {
        self.drop_console = value;
    }

    #[wasm_bindgen(setter)]
    pub fn set_drop_debugger(&mut self, value: bool) {
        self.drop_debugger = value;
    }

    #[wasm_bindgen(setter)]
    pub fn set_passes(&mut self, value: u8) {
        self.passes = value;
    }
}

impl Default for MinifyConfig {
    fn default() -> Self {
        Self {
            compress: true,
            mangle: true,
            source_map: false,
            keep_fn_names: false,
            keep_class_names: false,
            target: "es2020".to_string(),
            drop_console: false,
            drop_debugger: true,
            passes: 2,
        }
    }
}

/// Result of minification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinifyResult {
    /// Minified code
    pub code: String,
    /// Source map (if requested)
    pub source_map: Option<String>,
    /// Statistics about the minification
    pub stats: MinifyStats,
    /// Any warnings generated during minification
    pub warnings: Vec<String>,
}

/// Statistics from minification
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MinifyStats {
    /// Original code size in bytes
    pub original_size: usize,
    /// Minified code size in bytes
    pub minified_size: usize,
    /// Compression ratio (0-1)
    pub compression_ratio: f64,
    /// Time taken in milliseconds
    pub time_ms: u64,
}

/// Main minifier struct
#[wasm_bindgen]
pub struct Minifier {
    config: MinifyConfig,
}

#[wasm_bindgen]
impl Minifier {
    #[wasm_bindgen(constructor)]
    pub fn new(config: Option<MinifyConfig>) -> Self {
        Self {
            config: config.unwrap_or_default(),
        }
    }

    /// Minify JavaScript code
    #[wasm_bindgen]
    pub fn minify(&self, code: &str, filename: Option<String>) -> JsValue {
        let result = self.minify_internal(code, filename.as_deref());
        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    /// Minify multiple files in batch
    #[wasm_bindgen]
    pub fn minify_batch(&self, files_js: JsValue) -> JsValue {
        let files: Vec<FileInput> = serde_wasm_bindgen::from_value(files_js).unwrap_or_default();
        let results = self.minify_batch_internal(&files);
        serde_wasm_bindgen::to_value(&results).unwrap_or(JsValue::NULL)
    }

    /// Quick minify without full AST transformation (faster but less optimal)
    #[wasm_bindgen]
    pub fn quick_minify(&self, code: &str) -> String {
        self.quick_minify_internal(code)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInput {
    pub filename: String,
    pub code: String,
}

impl Minifier {
    fn minify_internal(&self, code: &str, filename: Option<&str>) -> MinifyResult {
        let start = std::time::Instant::now();
        let original_size = code.len();

        let cm: Lrc<SourceMap> = Default::default();
        let handler = Handler::with_tty_emitter(ColorConfig::Auto, true, false, Some(cm.clone()));

        let fm = cm.new_source_file(
            Arc::new(FileName::Custom(filename.unwrap_or("input.js").to_string())),
            code.to_string(),
        );

        let lexer = Lexer::new(
            Syntax::Es(EsSyntax {
                jsx: true,
                ..Default::default()
            }),
            self.get_es_version(),
            StringInput::from(&*fm),
            None,
        );

        let mut parser = Parser::new_from(lexer);
        let mut warnings = Vec::new();

        for e in parser.take_errors() {
            warnings.push(format!("Parse warning: {:?}", e));
        }

        let program = match parser.parse_program() {
            Ok(p) => p,
            Err(e) => {
                handler.emit(&e.into_diagnostic(&handler).cancel());
                return MinifyResult {
                    code: code.to_string(),
                    source_map: None,
                    stats: MinifyStats {
                        original_size,
                        minified_size: original_size,
                        compression_ratio: 1.0,
                        time_ms: start.elapsed().as_millis() as u64,
                    },
                    warnings: vec![format!("Parse error, returning original code")],
                };
            }
        };

        let minified_code = GLOBALS.set(&Globals::new(), || {
            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();

            let program = program.fold_with(&mut resolver(unresolved_mark, top_level_mark, false));

            let minify_options = MinifyOptions {
                compress: if self.config.compress {
                    Some(CompressOptions {
                        drop_console: self.config.drop_console,
                        drop_debugger: self.config.drop_debugger,
                        passes: self.config.passes as usize,
                        ..Default::default()
                    })
                } else {
                    None
                },
                mangle: if self.config.mangle {
                    Some(MangleOptions {
                        keep_fn_names: self.config.keep_fn_names,
                        keep_class_names: self.config.keep_class_names,
                        ..Default::default()
                    })
                } else {
                    None
                },
                ..Default::default()
            };

            let program = optimize(
                program,
                cm.clone(),
                None,
                None,
                &minify_options,
                &ExtraOptions {
                    unresolved_mark,
                    top_level_mark,
                    mangle_name_cache: None,
                },
            );

            let program = program.fold_with(&mut fixer(None));

            let mut buf = vec![];
            {
                let mut emitter = Emitter {
                    cfg: swc_ecma_codegen::Config::default().with_minify(true),
                    cm: cm.clone(),
                    comments: None,
                    wr: JsWriter::new(cm.clone(), "\n", &mut buf, None),
                };
                emitter.emit_program(&program).unwrap();
            }

            String::from_utf8(buf).unwrap_or_else(|_| code.to_string())
        });

        let minified_size = minified_code.len();
        let compression_ratio = if original_size > 0 {
            minified_size as f64 / original_size as f64
        } else {
            1.0
        };

        MinifyResult {
            code: minified_code,
            source_map: None, // TODO: Implement source map generation
            stats: MinifyStats {
                original_size,
                minified_size,
                compression_ratio,
                time_ms: start.elapsed().as_millis() as u64,
            },
            warnings,
        }
    }

    fn minify_batch_internal(&self, files: &[FileInput]) -> Vec<MinifyResult> {
        files
            .iter()
            .map(|f| self.minify_internal(&f.code, Some(&f.filename)))
            .collect()
    }

    fn quick_minify_internal(&self, code: &str) -> String {
        // Fast minification using regex-based transformations
        // This is much faster but produces less optimal results
        let mut result = code.to_string();

        // Remove single-line comments (but not URLs)
        let single_comment = regex::Regex::new(r"(?m)//(?![:/]).*$").unwrap();
        result = single_comment.replace_all(&result, "").to_string();

        // Remove multi-line comments
        let multi_comment = regex::Regex::new(r"/\*[\s\S]*?\*/").unwrap();
        result = multi_comment.replace_all(&result, "").to_string();

        // Remove unnecessary whitespace
        let whitespace = regex::Regex::new(r"\s+").unwrap();
        result = whitespace.replace_all(&result, " ").to_string();

        // Remove spaces around operators
        let operators = regex::Regex::new(r"\s*([=+\-*/<>!&|,;:{}()\[\]])\s*").unwrap();
        result = operators.replace_all(&result, "$1").to_string();

        // Remove trailing semicolons before closing braces
        let trailing_semi = regex::Regex::new(r";\s*}").unwrap();
        result = trailing_semi.replace_all(&result, "}").to_string();

        result.trim().to_string()
    }

    fn get_es_version(&self) -> EsVersion {
        match self.config.target.as_str() {
            "es3" => EsVersion::Es3,
            "es5" => EsVersion::Es5,
            "es2015" | "es6" => EsVersion::Es2015,
            "es2016" => EsVersion::Es2016,
            "es2017" => EsVersion::Es2017,
            "es2018" => EsVersion::Es2018,
            "es2019" => EsVersion::Es2019,
            "es2020" => EsVersion::Es2020,
            "es2021" => EsVersion::Es2021,
            "es2022" => EsVersion::Es2022,
            "esnext" | _ => EsVersion::EsNext,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quick_minify() {
        let minifier = Minifier::new(None);
        let code = r#"
            // This is a comment
            function hello(name) {
                console.log("Hello, " + name);
            }
        "#;
        
        let result = minifier.quick_minify_internal(code);
        assert!(!result.contains("// This is a comment"));
        assert!(result.len() < code.len());
    }

    #[test]
    fn test_minify() {
        let minifier = Minifier::new(None);
        let code = r#"
            function unusedFunction() {
                return 42;
            }
            
            export function usedFunction(a, b) {
                const result = a + b;
                return result;
            }
        "#;
        
        let result = minifier.minify_internal(code, Some("test.js"));
        assert!(result.stats.minified_size < result.stats.original_size);
    }
}
