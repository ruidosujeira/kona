//! Tree-shaking implementation in Rust
//!
//! Performs dead code elimination by analyzing import/export relationships
//! and removing unused code paths.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

/// Configuration for tree-shaking
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen]
pub struct TreeShakeConfig {
    /// Whether to preserve side effects
    #[wasm_bindgen(skip)]
    pub preserve_side_effects: bool,
    /// List of modules to always include (never shake)
    #[wasm_bindgen(skip)]
    pub preserve_modules: Vec<String>,
    /// Whether to analyze dynamic imports
    #[wasm_bindgen(skip)]
    pub analyze_dynamic_imports: bool,
}

#[wasm_bindgen]
impl TreeShakeConfig {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    #[wasm_bindgen(setter)]
    pub fn set_preserve_side_effects(&mut self, value: bool) {
        self.preserve_side_effects = value;
    }

    #[wasm_bindgen(setter)]
    pub fn set_analyze_dynamic_imports(&mut self, value: bool) {
        self.analyze_dynamic_imports = value;
    }

    pub fn add_preserve_module(&mut self, module: String) {
        self.preserve_modules.push(module);
    }
}

impl Default for TreeShakeConfig {
    fn default() -> Self {
        Self {
            preserve_side_effects: true,
            preserve_modules: Vec::new(),
            analyze_dynamic_imports: true,
        }
    }
}

/// Result of tree-shaking analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeShakeResult {
    /// Code after tree-shaking
    pub code: String,
    /// Source map (if available)
    pub source_map: Option<String>,
    /// List of removed exports
    pub removed_exports: Vec<String>,
    /// List of removed imports
    pub removed_imports: Vec<String>,
    /// Statistics about the optimization
    pub stats: TreeShakeStats,
}

/// Statistics from tree-shaking
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TreeShakeStats {
    /// Original code size in bytes
    pub original_size: usize,
    /// Final code size in bytes
    pub final_size: usize,
    /// Number of exports removed
    pub exports_removed: usize,
    /// Number of imports removed
    pub imports_removed: usize,
    /// Number of dead code blocks removed
    pub dead_blocks_removed: usize,
}

/// Module dependency graph for tree-shaking analysis
#[derive(Debug, Clone, Default)]
pub struct DependencyGraph {
    /// Map of module ID to its exports
    exports: HashMap<String, HashSet<String>>,
    /// Map of module ID to its imports (module_id -> (imported_module, imported_names))
    imports: HashMap<String, Vec<(String, HashSet<String>)>>,
    /// Set of entry points
    entry_points: HashSet<String>,
    /// Modules with side effects
    side_effect_modules: HashSet<String>,
}

impl DependencyGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_module(&mut self, module_id: &str, exports: HashSet<String>, has_side_effects: bool) {
        self.exports.insert(module_id.to_string(), exports);
        if has_side_effects {
            self.side_effect_modules.insert(module_id.to_string());
        }
    }

    pub fn add_import(&mut self, from_module: &str, to_module: &str, imported_names: HashSet<String>) {
        self.imports
            .entry(from_module.to_string())
            .or_default()
            .push((to_module.to_string(), imported_names));
    }

    pub fn add_entry_point(&mut self, module_id: &str) {
        self.entry_points.insert(module_id.to_string());
    }

    /// Analyze the graph and return set of used exports per module
    pub fn analyze(&self) -> HashMap<String, HashSet<String>> {
        let mut used_exports: HashMap<String, HashSet<String>> = HashMap::new();
        let mut visited: HashSet<String> = HashSet::new();
        let mut queue: Vec<String> = self.entry_points.iter().cloned().collect();

        while let Some(module_id) = queue.pop() {
            if visited.contains(&module_id) {
                continue;
            }
            visited.insert(module_id.clone());

            // Mark all exports of entry points as used
            if self.entry_points.contains(&module_id) {
                if let Some(exports) = self.exports.get(&module_id) {
                    used_exports
                        .entry(module_id.clone())
                        .or_default()
                        .extend(exports.clone());
                }
            }

            // Process imports
            if let Some(imports) = self.imports.get(&module_id) {
                for (imported_module, imported_names) in imports {
                    // Mark imported names as used in the imported module
                    used_exports
                        .entry(imported_module.clone())
                        .or_default()
                        .extend(imported_names.clone());

                    // Add to queue for processing
                    if !visited.contains(imported_module) {
                        queue.push(imported_module.clone());
                    }
                }
            }

            // Always include modules with side effects
            if self.side_effect_modules.contains(&module_id) {
                if let Some(exports) = self.exports.get(&module_id) {
                    used_exports
                        .entry(module_id.clone())
                        .or_default()
                        .extend(exports.clone());
                }
            }
        }

        used_exports
    }
}

/// Main tree-shaker struct
#[wasm_bindgen]
pub struct TreeShaker {
    config: TreeShakeConfig,
}

#[wasm_bindgen]
impl TreeShaker {
    #[wasm_bindgen(constructor)]
    pub fn new(config: Option<TreeShakeConfig>) -> Self {
        Self {
            config: config.unwrap_or_default(),
        }
    }

    /// Analyze code and extract export/import information
    #[wasm_bindgen]
    pub fn analyze_module(&self, code: &str, module_id: &str) -> JsValue {
        let analysis = self.analyze_module_internal(code, module_id);
        serde_wasm_bindgen::to_value(&analysis).unwrap_or(JsValue::NULL)
    }

    /// Perform tree-shaking on a single module
    #[wasm_bindgen]
    pub fn shake_module(
        &self,
        code: &str,
        used_exports_js: JsValue,
        generate_source_map: bool,
    ) -> JsValue {
        let used_exports: HashSet<String> = serde_wasm_bindgen::from_value(used_exports_js)
            .unwrap_or_default();
        
        let result = self.shake_module_internal(code, &used_exports, generate_source_map);
        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    /// Batch tree-shake multiple modules
    #[wasm_bindgen]
    pub fn shake_modules(&self, modules_js: JsValue) -> JsValue {
        let modules: Vec<ModuleInput> = serde_wasm_bindgen::from_value(modules_js)
            .unwrap_or_default();
        
        let results = self.shake_modules_internal(&modules);
        serde_wasm_bindgen::to_value(&results).unwrap_or(JsValue::NULL)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleInput {
    pub id: String,
    pub code: String,
    pub used_exports: HashSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleAnalysis {
    pub module_id: String,
    pub exports: Vec<String>,
    pub imports: Vec<ImportInfo>,
    pub has_side_effects: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportInfo {
    pub source: String,
    pub specifiers: Vec<String>,
    pub is_dynamic: bool,
}

impl TreeShaker {
    fn analyze_module_internal(&self, code: &str, module_id: &str) -> ModuleAnalysis {
        let mut exports = Vec::new();
        let mut imports = Vec::new();
        let mut has_side_effects = false;

        // Simple regex-based analysis for common patterns
        // In production, this would use SWC's full AST parsing
        
        // Find exports
        let export_regex = regex::Regex::new(r"export\s+(?:const|let|var|function|class|default)\s+(\w+)").unwrap();
        for cap in export_regex.captures_iter(code) {
            if let Some(name) = cap.get(1) {
                exports.push(name.as_str().to_string());
            }
        }

        // Find named exports
        let named_export_regex = regex::Regex::new(r"export\s*\{\s*([^}]+)\s*\}").unwrap();
        for cap in named_export_regex.captures_iter(code) {
            if let Some(names) = cap.get(1) {
                for name in names.as_str().split(',') {
                    let name = name.trim().split(" as ").next().unwrap_or("").trim();
                    if !name.is_empty() {
                        exports.push(name.to_string());
                    }
                }
            }
        }

        // Find imports
        let import_regex = regex::Regex::new(r#"import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]"#).unwrap();
        for cap in import_regex.captures_iter(code) {
            let source = cap.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();
            let mut specifiers = Vec::new();

            if let Some(named) = cap.get(1) {
                for spec in named.as_str().split(',') {
                    let spec = spec.trim().split(" as ").next().unwrap_or("").trim();
                    if !spec.is_empty() {
                        specifiers.push(spec.to_string());
                    }
                }
            }
            if let Some(default) = cap.get(2) {
                specifiers.push(default.as_str().to_string());
            }

            imports.push(ImportInfo {
                source,
                specifiers,
                is_dynamic: false,
            });
        }

        // Find dynamic imports
        if self.config.analyze_dynamic_imports {
            let dynamic_import_regex = regex::Regex::new(r#"import\s*\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap();
            for cap in dynamic_import_regex.captures_iter(code) {
                if let Some(source) = cap.get(1) {
                    imports.push(ImportInfo {
                        source: source.as_str().to_string(),
                        specifiers: vec!["*".to_string()],
                        is_dynamic: true,
                    });
                }
            }
        }

        // Check for side effects (top-level function calls, assignments to globals, etc.)
        if self.config.preserve_side_effects {
            let side_effect_patterns = [
                r"^\s*\w+\s*\(",           // Top-level function calls
                r"window\.",               // Window assignments
                r"document\.",             // Document manipulation
                r"globalThis\.",           // Global assignments
                r"^\s*if\s*\(",            // Top-level conditionals
            ];
            
            for pattern in &side_effect_patterns {
                if regex::Regex::new(pattern).map(|r| r.is_match(code)).unwrap_or(false) {
                    has_side_effects = true;
                    break;
                }
            }
        }

        ModuleAnalysis {
            module_id: module_id.to_string(),
            exports,
            imports,
            has_side_effects,
        }
    }

    fn shake_module_internal(
        &self,
        code: &str,
        used_exports: &HashSet<String>,
        _generate_source_map: bool,
    ) -> TreeShakeResult {
        let original_size = code.len();
        let mut result_code = code.to_string();
        let mut removed_exports = Vec::new();
        let mut removed_imports = Vec::new();
        let mut dead_blocks_removed = 0;

        // Remove unused exports
        let export_regex = regex::Regex::new(
            r"export\s+(?:const|let|var)\s+(\w+)\s*=\s*[^;]+;"
        ).unwrap();
        
        result_code = export_regex.replace_all(&result_code, |caps: &regex::Captures| {
            let name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            if !used_exports.contains(name) && !used_exports.contains("*") {
                removed_exports.push(name.to_string());
                dead_blocks_removed += 1;
                String::new()
            } else {
                caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default()
            }
        }).to_string();

        // Remove unused function exports
        let fn_export_regex = regex::Regex::new(
            r"export\s+function\s+(\w+)\s*\([^)]*\)\s*\{[^}]*\}"
        ).unwrap();
        
        result_code = fn_export_regex.replace_all(&result_code, |caps: &regex::Captures| {
            let name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            if !used_exports.contains(name) && !used_exports.contains("*") {
                removed_exports.push(name.to_string());
                dead_blocks_removed += 1;
                String::new()
            } else {
                caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default()
            }
        }).to_string();

        // Remove unused class exports
        let class_export_regex = regex::Regex::new(
            r"export\s+class\s+(\w+)\s*(?:extends\s+\w+\s*)?\{[^}]*\}"
        ).unwrap();
        
        result_code = class_export_regex.replace_all(&result_code, |caps: &regex::Captures| {
            let name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            if !used_exports.contains(name) && !used_exports.contains("*") {
                removed_exports.push(name.to_string());
                dead_blocks_removed += 1;
                String::new()
            } else {
                caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default()
            }
        }).to_string();

        // Clean up empty lines
        let empty_lines_regex = regex::Regex::new(r"\n\s*\n\s*\n").unwrap();
        result_code = empty_lines_regex.replace_all(&result_code, "\n\n").to_string();

        let final_size = result_code.len();

        TreeShakeResult {
            code: result_code,
            source_map: None,
            removed_exports,
            removed_imports,
            stats: TreeShakeStats {
                original_size,
                final_size,
                exports_removed: removed_exports.len(),
                imports_removed: removed_imports.len(),
                dead_blocks_removed,
            },
        }
    }

    fn shake_modules_internal(&self, modules: &[ModuleInput]) -> Vec<TreeShakeResult> {
        modules
            .iter()
            .map(|m| self.shake_module_internal(&m.code, &m.used_exports, false))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_module() {
        let shaker = TreeShaker::new(None);
        let code = r#"
            import { foo, bar } from './utils';
            export const used = foo();
            export const unused = bar();
            export function helper() {}
        "#;
        
        let analysis = shaker.analyze_module_internal(code, "test");
        assert!(analysis.exports.contains(&"used".to_string()));
        assert!(analysis.exports.contains(&"unused".to_string()));
        assert!(analysis.exports.contains(&"helper".to_string()));
    }

    #[test]
    fn test_shake_module() {
        let shaker = TreeShaker::new(None);
        let code = r#"export const used = 1;
export const unused = 2;"#;
        
        let mut used_exports = HashSet::new();
        used_exports.insert("used".to_string());
        
        let result = shaker.shake_module_internal(code, &used_exports, false);
        assert!(result.code.contains("used"));
        assert!(!result.code.contains("unused"));
    }
}
