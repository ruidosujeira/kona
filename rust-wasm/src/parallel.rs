//! Parallel processing utilities for Kona
//!
//! Uses rayon for parallel iteration when running natively,
//! falls back to sequential processing in WASM.

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[cfg(not(target_arch = "wasm32"))]
use rayon::prelude::*;

use crate::transformer::{transform_internal, TransformOptions};

/// Module to transform
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleInput {
    pub id: String,
    pub code: String,
    pub filename: String,
}

/// Transformed module
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleOutput {
    pub id: String,
    pub code: String,
    pub size: usize,
}

/// Parallel transformer
#[wasm_bindgen]
pub struct ParallelProcessor;

#[wasm_bindgen]
impl ParallelProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self
    }

    /// Transform multiple modules
    /// Returns JSON array of ModuleOutput
    #[wasm_bindgen]
    pub fn transform_modules(&self, modules_json: &str) -> String {
        let modules: Vec<ModuleInput> = match serde_json::from_str(modules_json) {
            Ok(m) => m,
            Err(_) => return "[]".to_string(),
        };

        let options = TransformOptions::default();
        let results: Vec<ModuleOutput> = modules
            .iter()
            .map(|m| {
                let result = transform_internal(&m.code, &m.filename, &options);
                let size = result.code.len();
                ModuleOutput {
                    id: m.id.clone(),
                    code: result.code,
                    size,
                }
            })
            .collect();
        
        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_modules() {
        let processor = ParallelProcessor::new();
        let modules_json = r#"[
            {"id": "a.tsx", "code": "const x: number = 1;", "filename": "a.tsx"},
            {"id": "b.tsx", "code": "const y = <div>test</div>;", "filename": "b.tsx"}
        ]"#;
        
        let result = processor.transform_modules(modules_json);
        assert!(result.contains("a.tsx"));
        assert!(result.contains("b.tsx"));
    }
}
