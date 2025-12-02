//! Kona WASM - High-performance tree-shaking and minification
//!
//! This module provides Rust-powered optimizations for the Kona bundler,
//! exposed via WebAssembly for seamless JavaScript integration.

pub mod minifier;
pub mod tree_shaker;
mod utils;
pub mod parser;
pub mod transformer;
pub mod bundler;
pub mod parallel;

use wasm_bindgen::prelude::*;

pub use minifier::*;
pub use tree_shaker::*;
pub use parser::*;
pub use transformer::*;
pub use bundler::*;
pub use parallel::*;

/// Initialize the WASM module with panic hook for better error messages
#[wasm_bindgen(start)]
pub fn init() {
    utils::set_panic_hook();
}

/// Get the version of the WASM module
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Health check to verify WASM module is loaded correctly
#[wasm_bindgen]
pub fn health_check() -> bool {
    true
}
