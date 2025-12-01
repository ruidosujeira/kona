//! Utility functions for the WASM module

/// Set up panic hook for better error messages in the browser console
pub fn set_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
