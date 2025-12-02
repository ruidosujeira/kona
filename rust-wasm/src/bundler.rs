//! Fast bundle generator in Rust
//!
//! Generates the final bundle code from transformed modules.
//! Much faster than string concatenation in JavaScript.

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

/// Module info for bundling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleInfo {
    pub id: String,
    pub code: String,
    pub is_entry: bool,
}

/// Bundle options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleOptions {
    pub format: String, // "iife", "esm", "cjs"
    pub minify: bool,
}

impl Default for BundleOptions {
    fn default() -> Self {
        Self {
            format: "iife".to_string(),
            minify: false,
        }
    }
}

/// Bundle generator
#[wasm_bindgen]
pub struct BundleGenerator {
    // No state needed
}

#[wasm_bindgen]
impl BundleGenerator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {}
    }

    /// Generate bundle from modules
    /// modules_json: JSON array of ModuleInfo
    #[wasm_bindgen]
    pub fn generate(&self, modules_json: &str, options_json: Option<String>) -> String {
        let modules: Vec<ModuleInfo> = match serde_json::from_str(modules_json) {
            Ok(m) => m,
            Err(_) => return String::new(),
        };

        let options: BundleOptions = options_json
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        generate_bundle_internal(&modules, &options)
    }

    /// Generate bundle with pre-parsed modules (faster)
    #[wasm_bindgen]
    pub fn generate_fast(&self, module_ids: Vec<JsValue>, module_codes: Vec<JsValue>, entry_indices: Vec<usize>) -> String {
        let mut modules = Vec::with_capacity(module_ids.len());
        
        for i in 0..module_ids.len() {
            let id = module_ids[i].as_string().unwrap_or_default();
            let code = module_codes[i].as_string().unwrap_or_default();
            let is_entry = entry_indices.contains(&i);
            
            modules.push(ModuleInfo { id, code, is_entry });
        }

        generate_bundle_internal(&modules, &BundleOptions::default())
    }
}

/// Internal bundle generation
fn generate_bundle_internal(modules: &[ModuleInfo], options: &BundleOptions) -> String {
    let total_size: usize = modules.iter().map(|m| m.code.len() + m.id.len() + 100).sum();
    let mut output = String::with_capacity(total_size + 1000);

    // Find entries
    let entries: Vec<&ModuleInfo> = modules.iter().filter(|m| m.is_entry).collect();

    match options.format.as_str() {
        "esm" => generate_esm(&mut output, modules, &entries),
        "cjs" => generate_cjs(&mut output, modules, &entries),
        _ => generate_iife(&mut output, modules, &entries),
    }

    if options.minify {
        minify_output(&mut output);
    }

    output
}

/// Generate IIFE bundle
fn generate_iife(output: &mut String, modules: &[ModuleInfo], entries: &[&ModuleInfo]) {
    output.push_str("// Kona Bundle\n");
    output.push_str("(function(modules) {\n");
    output.push_str("  var cache = {};\n");
    output.push_str("  function require(id) {\n");
    output.push_str("    if (cache[id]) return cache[id].exports;\n");
    output.push_str("    var m = cache[id] = { exports: {} };\n");
    output.push_str("    modules[id](m, m.exports, require);\n");
    output.push_str("    return m.exports;\n");
    output.push_str("  }\n");

    // Entry points
    for entry in entries {
        output.push_str(&format!("  require(\"{}\");\n", escape_string(&entry.id)));
    }

    output.push_str("})({");

    // Modules
    let mut first = true;
    for module in modules {
        if !first {
            output.push(',');
        }
        first = false;
        
        output.push('\n');
        output.push_str(&format!("\"{}\":function(module,exports,require){{\n", escape_string(&module.id)));
        output.push_str(&module.code);
        output.push_str("\n}");
    }

    output.push_str("\n});\n");
}

/// Generate ESM bundle
fn generate_esm(output: &mut String, modules: &[ModuleInfo], entries: &[&ModuleInfo]) {
    output.push_str("// Kona ESM Bundle\n");
    output.push_str("const __modules = {};\n");
    output.push_str("const __cache = {};\n");
    output.push_str("function __require(id) {\n");
    output.push_str("  if (__cache[id]) return __cache[id].exports;\n");
    output.push_str("  const m = __cache[id] = { exports: {} };\n");
    output.push_str("  __modules[id](m, m.exports, __require);\n");
    output.push_str("  return m.exports;\n");
    output.push_str("}\n\n");

    // Modules
    for module in modules {
        output.push_str(&format!("__modules[\"{}\"] = function(module, exports, require) {{\n", escape_string(&module.id)));
        output.push_str(&module.code);
        output.push_str("\n};\n\n");
    }

    // Entry points
    for entry in entries {
        output.push_str(&format!("__require(\"{}\");\n", escape_string(&entry.id)));
    }
}

/// Generate CJS bundle
fn generate_cjs(output: &mut String, modules: &[ModuleInfo], entries: &[&ModuleInfo]) {
    output.push_str("// Kona CJS Bundle\n");
    output.push_str("\"use strict\";\n");
    output.push_str("var __modules = {};\n");
    output.push_str("var __cache = {};\n");
    output.push_str("function __require(id) {\n");
    output.push_str("  if (__cache[id]) return __cache[id].exports;\n");
    output.push_str("  var m = __cache[id] = { exports: {} };\n");
    output.push_str("  __modules[id](m, m.exports, __require);\n");
    output.push_str("  return m.exports;\n");
    output.push_str("}\n\n");

    // Modules
    for module in modules {
        output.push_str(&format!("__modules[\"{}\"] = function(module, exports, require) {{\n", escape_string(&module.id)));
        output.push_str(&module.code);
        output.push_str("\n};\n\n");
    }

    // Entry points and exports
    if let Some(entry) = entries.first() {
        output.push_str(&format!("module.exports = __require(\"{}\");\n", escape_string(&entry.id)));
    }
}

/// Escape string for JavaScript
fn escape_string(s: &str) -> String {
    s.replace('\\', "\\\\")
     .replace('"', "\\\"")
     .replace('\n', "\\n")
     .replace('\r', "\\r")
}

/// Quick minification
fn minify_output(output: &mut String) {
    // Remove comments
    let comment_re = regex::Regex::new(r"(?m)//[^\n]*$").unwrap();
    *output = comment_re.replace_all(output, "").to_string();
    
    // Collapse whitespace (but preserve strings)
    let mut result = String::with_capacity(output.len());
    let bytes = output.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut last_was_space = false;

    while i < len {
        let ch = bytes[i];
        
        // Skip strings
        if ch == b'"' || ch == b'\'' || ch == b'`' {
            let quote = ch;
            result.push(ch as char);
            i += 1;
            while i < len && bytes[i] != quote {
                if bytes[i] == b'\\' && i + 1 < len {
                    result.push(bytes[i] as char);
                    i += 1;
                }
                result.push(bytes[i] as char);
                i += 1;
            }
            if i < len {
                result.push(bytes[i] as char);
                i += 1;
            }
            last_was_space = false;
            continue;
        }

        // Collapse whitespace
        if ch == b' ' || ch == b'\t' || ch == b'\n' || ch == b'\r' {
            if !last_was_space {
                result.push(' ');
                last_was_space = true;
            }
            i += 1;
            continue;
        }

        result.push(ch as char);
        last_was_space = false;
        i += 1;
    }

    *output = result;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_iife() {
        let modules = vec![
            ModuleInfo {
                id: "index.js".to_string(),
                code: "console.log('hello');".to_string(),
                is_entry: true,
            },
        ];
        
        let result = generate_bundle_internal(&modules, &BundleOptions::default());
        assert!(result.contains("Kona Bundle"));
        assert!(result.contains("index.js"));
        assert!(result.contains("console.log"));
    }

    #[test]
    fn test_generate_esm() {
        let modules = vec![
            ModuleInfo {
                id: "index.js".to_string(),
                code: "export default 42;".to_string(),
                is_entry: true,
            },
        ];
        
        let options = BundleOptions {
            format: "esm".to_string(),
            minify: false,
        };
        
        let result = generate_bundle_internal(&modules, &options);
        assert!(result.contains("ESM Bundle"));
        assert!(result.contains("__modules"));
    }

    #[test]
    fn test_multiple_modules() {
        let modules = vec![
            ModuleInfo {
                id: "utils.js".to_string(),
                code: "module.exports.add = (a, b) => a + b;".to_string(),
                is_entry: false,
            },
            ModuleInfo {
                id: "index.js".to_string(),
                code: "var utils = require('utils.js'); console.log(utils.add(1, 2));".to_string(),
                is_entry: true,
            },
        ];
        
        let result = generate_bundle_internal(&modules, &BundleOptions::default());
        assert!(result.contains("utils.js"));
        assert!(result.contains("index.js"));
    }
}
