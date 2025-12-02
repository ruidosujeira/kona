//! Fast TypeScript/JSX transformer
//!
//! Transforms:
//! - TypeScript type annotations → removed
//! - JSX → React.createElement / jsx calls
//! - Import/export rewriting
//! - Optional: minification

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

/// Transform options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen]
pub struct TransformOptions {
    #[wasm_bindgen(skip)]
    pub jsx_runtime: JsxRuntime,
    #[wasm_bindgen(skip)]
    pub jsx_import_source: String,
    #[wasm_bindgen(skip)]
    pub remove_types: bool,
    #[wasm_bindgen(skip)]
    pub minify: bool,
    #[wasm_bindgen(skip)]
    pub target: Target,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum JsxRuntime {
    Classic,    // React.createElement
    Automatic,  // jsx/jsxs from react/jsx-runtime
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum Target {
    ES2020,
    ES2021,
    ES2022,
    ESNext,
}

impl Default for TransformOptions {
    fn default() -> Self {
        Self {
            jsx_runtime: JsxRuntime::Automatic,
            jsx_import_source: "react".to_string(),
            remove_types: true,
            minify: false,
            target: Target::ES2020,
        }
    }
}

#[wasm_bindgen]
impl TransformOptions {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    #[wasm_bindgen(setter)]
    pub fn set_jsx_runtime(&mut self, runtime: &str) {
        self.jsx_runtime = match runtime {
            "classic" => JsxRuntime::Classic,
            _ => JsxRuntime::Automatic,
        };
    }

    #[wasm_bindgen(setter)]
    pub fn set_jsx_import_source(&mut self, source: String) {
        self.jsx_import_source = source;
    }

    #[wasm_bindgen(setter)]
    pub fn set_remove_types(&mut self, value: bool) {
        self.remove_types = value;
    }

    #[wasm_bindgen(setter)]
    pub fn set_minify(&mut self, value: bool) {
        self.minify = value;
    }
}

/// Transform result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransformResult {
    pub code: String,
    pub had_jsx: bool,
    pub had_types: bool,
}

/// Main transformer
#[wasm_bindgen]
pub struct Transformer {
    options: TransformOptions,
}

#[wasm_bindgen]
impl Transformer {
    #[wasm_bindgen(constructor)]
    pub fn new(options: Option<TransformOptions>) -> Self {
        Self {
            options: options.unwrap_or_default(),
        }
    }

    /// Transform TypeScript/JSX to JavaScript
    #[wasm_bindgen]
    pub fn transform(&self, source: &str, filename: &str) -> JsValue {
        let result = transform_internal(source, filename, &self.options);
        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    /// Transform and return just the code string (faster)
    #[wasm_bindgen]
    pub fn transform_code(&self, source: &str, filename: &str) -> String {
        transform_internal(source, filename, &self.options).code
    }
}

/// Internal transform function
pub fn transform_internal(source: &str, filename: &str, options: &TransformOptions) -> TransformResult {
    let mut code = source.to_string();
    let mut had_jsx = false;
    let mut had_types = false;

    // Detect file type
    let is_tsx = filename.ends_with(".tsx");
    let is_ts = filename.ends_with(".ts") || is_tsx;
    let is_jsx = filename.ends_with(".jsx") || is_tsx;

    // Remove TypeScript types
    if options.remove_types && is_ts {
        let (new_code, found_types) = remove_typescript_types(&code);
        code = new_code;
        had_types = found_types;
    }

    // Transform JSX
    if is_jsx {
        let (new_code, found_jsx) = transform_jsx(&code, options);
        code = new_code;
        had_jsx = found_jsx;
    }

    // Add JSX runtime import if needed
    if had_jsx && options.jsx_runtime == JsxRuntime::Automatic {
        code = add_jsx_import(&code, options);
    }

    // Minify if requested
    if options.minify {
        code = quick_minify(&code);
    }

    TransformResult {
        code,
        had_jsx,
        had_types,
    }
}

/// Remove TypeScript type annotations
fn remove_typescript_types(source: &str) -> (String, bool) {
    let mut result = String::with_capacity(source.len());
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut had_types = false;

    while i < len {
        // Skip string literals
        if bytes[i] == b'"' || bytes[i] == b'\'' || bytes[i] == b'`' {
            let quote = bytes[i];
            result.push(bytes[i] as char);
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
            continue;
        }

        // Skip comments
        if bytes[i] == b'/' {
            if i + 1 < len && bytes[i + 1] == b'/' {
                // Single-line comment
                while i < len && bytes[i] != b'\n' {
                    result.push(bytes[i] as char);
                    i += 1;
                }
                continue;
            }
            if i + 1 < len && bytes[i + 1] == b'*' {
                // Multi-line comment
                result.push('/');
                result.push('*');
                i += 2;
                while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    result.push(bytes[i] as char);
                    i += 1;
                }
                if i + 1 < len {
                    result.push('*');
                    result.push('/');
                    i += 2;
                }
                continue;
            }
        }

        // Remove type imports: import type { X } from 'y'
        if i + 11 < len && &bytes[i..i+11] == b"import type" {
            had_types = true;
            // Skip entire import statement
            while i < len && bytes[i] != b';' && bytes[i] != b'\n' {
                i += 1;
            }
            if i < len && bytes[i] == b';' {
                i += 1;
            }
            result.push('\n');
            continue;
        }

        // Remove type exports: export type { X }
        if i + 11 < len && &bytes[i..i+11] == b"export type" {
            // Check if it's "export type {" not "export type X ="
            let mut j = i + 11;
            while j < len && (bytes[j] == b' ' || bytes[j] == b'\t') {
                j += 1;
            }
            if j < len && bytes[j] == b'{' {
                had_types = true;
                while i < len && bytes[i] != b';' && bytes[i] != b'\n' {
                    i += 1;
                }
                if i < len && bytes[i] == b';' {
                    i += 1;
                }
                result.push('\n');
                continue;
            }
        }

        // Remove interface declarations
        if i + 9 < len && &bytes[i..i+9] == b"interface" {
            // Check it's a keyword (not part of identifier)
            let before_ok = i == 0 || !bytes[i-1].is_ascii_alphanumeric();
            let after_ok = i + 9 >= len || !bytes[i+9].is_ascii_alphanumeric();
            if before_ok && after_ok {
                had_types = true;
                // Skip to end of interface block
                let mut brace_depth = 0;
                let mut found_brace = false;
                while i < len {
                    if bytes[i] == b'{' {
                        brace_depth += 1;
                        found_brace = true;
                    } else if bytes[i] == b'}' {
                        brace_depth -= 1;
                        if found_brace && brace_depth == 0 {
                            i += 1;
                            break;
                        }
                    }
                    i += 1;
                }
                result.push('\n');
                continue;
            }
        }

        // Remove type alias: type X = ...
        if i + 4 < len && &bytes[i..i+4] == b"type" {
            let before_ok = i == 0 || !bytes[i-1].is_ascii_alphanumeric();
            let after_ok = i + 4 < len && (bytes[i+4] == b' ' || bytes[i+4] == b'\t');
            if before_ok && after_ok {
                // Check if followed by identifier and =
                let mut j = i + 4;
                while j < len && (bytes[j] == b' ' || bytes[j] == b'\t') {
                    j += 1;
                }
                // Skip identifier
                let id_start = j;
                while j < len && (bytes[j].is_ascii_alphanumeric() || bytes[j] == b'_') {
                    j += 1;
                }
                if j > id_start {
                    // Skip whitespace and generics
                    while j < len && (bytes[j] == b' ' || bytes[j] == b'\t' || bytes[j] == b'<') {
                        if bytes[j] == b'<' {
                            let mut depth = 1;
                            j += 1;
                            while j < len && depth > 0 {
                                if bytes[j] == b'<' { depth += 1; }
                                if bytes[j] == b'>' { depth -= 1; }
                                j += 1;
                            }
                        } else {
                            j += 1;
                        }
                    }
                    // Check for =
                    if j < len && bytes[j] == b'=' {
                        had_types = true;
                        // Skip to semicolon or newline
                        while i < len && bytes[i] != b';' && bytes[i] != b'\n' {
                            // Handle nested braces/parens
                            if bytes[i] == b'{' || bytes[i] == b'(' {
                                let open = bytes[i];
                                let close = if open == b'{' { b'}' } else { b')' };
                                let mut depth = 1;
                                i += 1;
                                while i < len && depth > 0 {
                                    if bytes[i] == open { depth += 1; }
                                    if bytes[i] == close { depth -= 1; }
                                    i += 1;
                                }
                                continue;
                            }
                            i += 1;
                        }
                        if i < len && bytes[i] == b';' {
                            i += 1;
                        }
                        result.push('\n');
                        continue;
                    }
                }
            }
        }

        // Remove type annotations after : (function params, variable declarations)
        if bytes[i] == b':' {
            // Check if this looks like a type annotation
            // Skip if it's inside an object literal (key: value)
            let mut j = i + 1;
            while j < len && (bytes[j] == b' ' || bytes[j] == b'\t') {
                j += 1;
            }
            
            // Check for common type patterns
            if j < len {
                let is_type_annotation = 
                    // Primitive types
                    (j + 6 <= len && &bytes[j..j+6] == b"string") ||
                    (j + 6 <= len && &bytes[j..j+6] == b"number") ||
                    (j + 7 <= len && &bytes[j..j+7] == b"boolean") ||
                    (j + 3 <= len && &bytes[j..j+3] == b"any") ||
                    (j + 4 <= len && &bytes[j..j+4] == b"void") ||
                    (j + 5 <= len && &bytes[j..j+5] == b"never") ||
                    (j + 4 <= len && &bytes[j..j+4] == b"null") ||
                    (j + 9 <= len && &bytes[j..j+9] == b"undefined") ||
                    // Array/object types
                    bytes[j] == b'{' ||
                    bytes[j] == b'[' ||
                    // Generic types (uppercase start)
                    bytes[j].is_ascii_uppercase() ||
                    // Union/intersection
                    bytes[j] == b'(' ||
                    // Typeof
                    (j + 6 <= len && &bytes[j..j+6] == b"typeof");

                if is_type_annotation {
                    had_types = true;
                    // Skip the type annotation
                    i += 1;
                    while i < len {
                        let ch = bytes[i];
                        // Stop at these characters
                        if ch == b'=' || ch == b',' || ch == b')' || ch == b';' || 
                           ch == b'{' || ch == b'\n' {
                            break;
                        }
                        // Handle nested generics
                        if ch == b'<' {
                            let mut depth = 1;
                            i += 1;
                            while i < len && depth > 0 {
                                if bytes[i] == b'<' { depth += 1; }
                                if bytes[i] == b'>' { depth -= 1; }
                                i += 1;
                            }
                            continue;
                        }
                        // Handle nested parens (function types)
                        if ch == b'(' {
                            let mut depth = 1;
                            i += 1;
                            while i < len && depth > 0 {
                                if bytes[i] == b'(' { depth += 1; }
                                if bytes[i] == b')' { depth -= 1; }
                                i += 1;
                            }
                            continue;
                        }
                        // Handle array type []
                        if ch == b'[' {
                            i += 1;
                            if i < len && bytes[i] == b']' {
                                i += 1;
                            }
                            continue;
                        }
                        i += 1;
                    }
                    continue;
                }
            }
        }

        // Remove generic type parameters from functions/classes
        if bytes[i] == b'<' {
            // Check if previous char suggests this is a generic
            let prev_is_ident = i > 0 && (bytes[i-1].is_ascii_alphanumeric() || bytes[i-1] == b'_');
            if prev_is_ident {
                // Look ahead to see if this is a generic type parameter
                let mut j = i + 1;
                let mut depth = 1;
                let mut looks_like_generic = true;
                
                while j < len && depth > 0 {
                    if bytes[j] == b'<' { depth += 1; }
                    if bytes[j] == b'>' { depth -= 1; }
                    // If we see these, it's probably comparison not generic
                    if bytes[j] == b';' || bytes[j] == b'\n' {
                        looks_like_generic = false;
                        break;
                    }
                    j += 1;
                }
                
                if looks_like_generic && depth == 0 {
                    // Check what follows the >
                    while j < len && (bytes[j] == b' ' || bytes[j] == b'\t') {
                        j += 1;
                    }
                    // If followed by ( or { or extends, it's a generic
                    if j < len && (bytes[j] == b'(' || bytes[j] == b'{' || 
                                   (j + 7 <= len && &bytes[j..j+7] == b"extends")) {
                        had_types = true;
                        // Skip the generic
                        i += 1;
                        depth = 1;
                        while i < len && depth > 0 {
                            if bytes[i] == b'<' { depth += 1; }
                            if bytes[i] == b'>' { depth -= 1; }
                            i += 1;
                        }
                        continue;
                    }
                }
            }
        }

        // Remove 'as' type assertions
        if i + 2 < len && &bytes[i..i+2] == b"as" {
            let before_ok = i > 0 && (bytes[i-1] == b' ' || bytes[i-1] == b')' || bytes[i-1] == b']');
            let after_ok = i + 2 < len && bytes[i+2] == b' ';
            if before_ok && after_ok {
                had_types = true;
                i += 2;
                // Skip whitespace
                while i < len && (bytes[i] == b' ' || bytes[i] == b'\t') {
                    i += 1;
                }
                // Skip the type
                while i < len {
                    let ch = bytes[i];
                    if ch == b';' || ch == b',' || ch == b')' || ch == b']' || 
                       ch == b'\n' || ch == b'{' || ch == b'}' {
                        break;
                    }
                    if ch == b'<' {
                        let mut depth = 1;
                        i += 1;
                        while i < len && depth > 0 {
                            if bytes[i] == b'<' { depth += 1; }
                            if bytes[i] == b'>' { depth -= 1; }
                            i += 1;
                        }
                        continue;
                    }
                    i += 1;
                }
                continue;
            }
        }

        // Remove non-null assertion !
        if bytes[i] == b'!' {
            // Check if it's a non-null assertion (identifier! or )! or ]!)
            if i > 0 {
                let prev = bytes[i - 1];
                if prev.is_ascii_alphanumeric() || prev == b'_' || prev == b')' || prev == b']' {
                    // Check what follows
                    if i + 1 < len {
                        let next = bytes[i + 1];
                        // If followed by . or [ or ) or , or ; it's likely non-null assertion
                        if next == b'.' || next == b'[' || next == b')' || 
                           next == b',' || next == b';' || next == b'\n' {
                            had_types = true;
                            i += 1;
                            continue;
                        }
                    }
                }
            }
        }

        result.push(bytes[i] as char);
        i += 1;
    }

    (result, had_types)
}

/// Transform JSX to JavaScript
fn transform_jsx(source: &str, options: &TransformOptions) -> (String, bool) {
    let mut result = String::with_capacity(source.len() * 2);
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut had_jsx = false;

    while i < len {
        // Skip string literals
        if bytes[i] == b'"' || bytes[i] == b'\'' || bytes[i] == b'`' {
            let quote = bytes[i];
            result.push(bytes[i] as char);
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
            continue;
        }

        // Skip comments
        if bytes[i] == b'/' {
            if i + 1 < len && bytes[i + 1] == b'/' {
                while i < len && bytes[i] != b'\n' {
                    result.push(bytes[i] as char);
                    i += 1;
                }
                continue;
            }
            if i + 1 < len && bytes[i + 1] == b'*' {
                result.push('/');
                result.push('*');
                i += 2;
                while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    result.push(bytes[i] as char);
                    i += 1;
                }
                if i + 1 < len {
                    result.push('*');
                    result.push('/');
                    i += 2;
                }
                continue;
            }
        }

        // Detect JSX opening tag
        if bytes[i] == b'<' {
            if i + 1 < len {
                let next = bytes[i + 1];
                // <Component or <div or <>
                if next.is_ascii_alphabetic() || next == b'>' {
                    let (jsx_result, consumed) = parse_jsx_element(&bytes[i..], options);
                    if consumed > 0 {
                        had_jsx = true;
                        result.push_str(&jsx_result);
                        i += consumed;
                        continue;
                    }
                }
            }
        }

        result.push(bytes[i] as char);
        i += 1;
    }

    (result, had_jsx)
}

/// Parse a single JSX element and return transformed code
fn parse_jsx_element(bytes: &[u8], options: &TransformOptions) -> (String, usize) {
    let len = bytes.len();
    if len < 2 || bytes[0] != b'<' {
        return (String::new(), 0);
    }

    let mut i = 1;

    // Fragment <>
    if bytes[i] == b'>' {
        i += 1;
        let (children, consumed) = parse_jsx_children(&bytes[i..], options);
        i += consumed;
        // Skip </>
        if i + 2 < len && bytes[i] == b'<' && bytes[i+1] == b'/' && bytes[i+2] == b'>' {
            i += 3;
        }
        
        let result = if options.jsx_runtime == JsxRuntime::Automatic {
            if children.is_empty() {
                "_jsx(_Fragment, {})".to_string()
            } else {
                format!("_jsxs(_Fragment, {{ children: [{}] }})", children.join(", "))
            }
        } else {
            format!("React.createElement(React.Fragment, null{})", 
                    if children.is_empty() { "".to_string() } else { format!(", {}", children.join(", ")) })
        };
        return (result, i);
    }

    // Parse tag name
    let tag_start = i;
    while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'.' || bytes[i] == b'-') {
        i += 1;
    }
    let tag_name = String::from_utf8_lossy(&bytes[tag_start..i]).to_string();
    
    if tag_name.is_empty() {
        return (String::new(), 0);
    }

    // Is it a component (uppercase) or HTML element (lowercase)?
    let is_component = tag_name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
    let tag_ref = if is_component {
        tag_name.clone()
    } else {
        format!("\"{}\"", tag_name)
    };

    // Parse attributes
    let mut props: Vec<String> = Vec::new();
    let mut key_prop: Option<String> = None;
    
    while i < len {
        // Skip whitespace
        while i < len && (bytes[i] == b' ' || bytes[i] == b'\t' || bytes[i] == b'\n') {
            i += 1;
        }

        // End of opening tag
        if i < len && bytes[i] == b'>' {
            i += 1;
            break;
        }

        // Self-closing tag
        if i + 1 < len && bytes[i] == b'/' && bytes[i+1] == b'>' {
            i += 2;
            // Generate self-closing element
            let result = generate_jsx_call(&tag_ref, &props, &key_prop, &[], options);
            return (result, i);
        }

        // Spread attribute {...expr}
        if i + 2 < len && bytes[i] == b'{' && bytes[i+1] == b'.' && bytes[i+2] == b'.' {
            i += 3;
            // Skip ...
            if i < len && bytes[i] == b'.' {
                i += 1;
            }
            let (expr, consumed) = parse_jsx_expression(&bytes[i..]);
            props.push(format!("...{}", expr));
            i += consumed;
            // Skip closing }
            if i < len && bytes[i] == b'}' {
                i += 1;
            }
            continue;
        }

        // Parse attribute name
        let attr_start = i;
        while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'-') {
            i += 1;
        }
        
        if i == attr_start {
            break; // No attribute found
        }
        
        let attr_name = String::from_utf8_lossy(&bytes[attr_start..i]).to_string();
        let js_attr_name = convert_jsx_attr_name(&attr_name);

        // Skip whitespace
        while i < len && (bytes[i] == b' ' || bytes[i] == b'\t') {
            i += 1;
        }

        // Check for =
        if i < len && bytes[i] == b'=' {
            i += 1;
            // Skip whitespace
            while i < len && (bytes[i] == b' ' || bytes[i] == b'\t') {
                i += 1;
            }

            // Parse attribute value
            if i < len {
                if bytes[i] == b'"' || bytes[i] == b'\'' {
                    // String value
                    let quote = bytes[i];
                    i += 1;
                    let value_start = i;
                    while i < len && bytes[i] != quote {
                        i += 1;
                    }
                    let value = String::from_utf8_lossy(&bytes[value_start..i]).to_string();
                    i += 1; // Skip closing quote
                    
                    if js_attr_name == "key" {
                        key_prop = Some(format!("\"{}\"", value));
                    } else {
                        props.push(format!("{}: \"{}\"", js_attr_name, value));
                    }
                } else if bytes[i] == b'{' {
                    // Expression value
                    i += 1;
                    let (expr, consumed) = parse_jsx_expression(&bytes[i..]);
                    i += consumed;
                    if i < len && bytes[i] == b'}' {
                        i += 1;
                    }
                    
                    if js_attr_name == "key" {
                        key_prop = Some(expr);
                    } else {
                        props.push(format!("{}: {}", js_attr_name, expr));
                    }
                }
            }
        } else {
            // Boolean attribute (no value)
            props.push(format!("{}: true", js_attr_name));
        }
    }

    // Parse children
    let (children, consumed) = parse_jsx_children(&bytes[i..], options);
    i += consumed;

    // Skip closing tag </tagName>
    if i + 2 < len && bytes[i] == b'<' && bytes[i+1] == b'/' {
        i += 2;
        // Skip tag name
        while i < len && bytes[i] != b'>' {
            i += 1;
        }
        if i < len {
            i += 1; // Skip >
        }
    }

    let result = generate_jsx_call(&tag_ref, &props, &key_prop, &children, options);
    (result, i)
}

/// Parse JSX children
fn parse_jsx_children(bytes: &[u8], options: &TransformOptions) -> (Vec<String>, usize) {
    let len = bytes.len();
    let mut children: Vec<String> = Vec::new();
    let mut i = 0;
    let mut text_buffer = String::new();

    while i < len {
        // Check for closing tag
        if i + 1 < len && bytes[i] == b'<' && bytes[i+1] == b'/' {
            break;
        }

        // Check for child element
        if bytes[i] == b'<' {
            // Flush text buffer
            if !text_buffer.trim().is_empty() {
                children.push(format!("\"{}\"", escape_jsx_text(&text_buffer)));
            }
            text_buffer.clear();

            let (child, consumed) = parse_jsx_element(&bytes[i..], options);
            if consumed > 0 {
                children.push(child);
                i += consumed;
                continue;
            }
        }

        // Check for expression {expr}
        if bytes[i] == b'{' {
            // Flush text buffer
            if !text_buffer.trim().is_empty() {
                children.push(format!("\"{}\"", escape_jsx_text(&text_buffer)));
            }
            text_buffer.clear();

            i += 1;
            let (expr, consumed) = parse_jsx_expression(&bytes[i..]);
            children.push(expr);
            i += consumed;
            if i < len && bytes[i] == b'}' {
                i += 1;
            }
            continue;
        }

        // Regular text
        text_buffer.push(bytes[i] as char);
        i += 1;
    }

    // Flush remaining text
    if !text_buffer.trim().is_empty() {
        children.push(format!("\"{}\"", escape_jsx_text(&text_buffer)));
    }

    (children, i)
}

/// Parse a JSX expression (inside {})
fn parse_jsx_expression(bytes: &[u8]) -> (String, usize) {
    let len = bytes.len();
    let mut i = 0;
    let mut depth = 0;
    let start = i;

    while i < len {
        match bytes[i] {
            b'{' => depth += 1,
            b'}' => {
                if depth == 0 {
                    break;
                }
                depth -= 1;
            }
            b'"' | b'\'' | b'`' => {
                // Skip string
                let quote = bytes[i];
                i += 1;
                while i < len && bytes[i] != quote {
                    if bytes[i] == b'\\' {
                        i += 1;
                    }
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    let expr = String::from_utf8_lossy(&bytes[start..i]).to_string();
    (expr.trim().to_string(), i)
}

/// Generate the final JSX call
fn generate_jsx_call(
    tag: &str, 
    props: &[String], 
    key: &Option<String>,
    children: &[String],
    options: &TransformOptions
) -> String {
    if options.jsx_runtime == JsxRuntime::Automatic {
        let has_children = !children.is_empty();
        let func = if children.len() > 1 { "_jsxs" } else { "_jsx" };
        
        let mut all_props = props.to_vec();
        if has_children {
            if children.len() == 1 {
                all_props.push(format!("children: {}", children[0]));
            } else {
                all_props.push(format!("children: [{}]", children.join(", ")));
            }
        }
        
        let props_obj = if all_props.is_empty() {
            "{}".to_string()
        } else {
            format!("{{ {} }}", all_props.join(", "))
        };

        if let Some(k) = key {
            format!("{}({}, {}, {})", func, tag, props_obj, k)
        } else {
            format!("{}({}, {})", func, tag, props_obj)
        }
    } else {
        // Classic runtime
        let props_obj = if props.is_empty() {
            "null".to_string()
        } else {
            format!("{{ {} }}", props.join(", "))
        };

        let mut args = vec![tag.to_string(), props_obj];
        args.extend(children.iter().cloned());
        
        format!("React.createElement({})", args.join(", "))
    }
}

/// Convert JSX attribute name to JS property name
fn convert_jsx_attr_name(name: &str) -> String {
    match name {
        "class" => "className".to_string(),
        "for" => "htmlFor".to_string(),
        "tabindex" => "tabIndex".to_string(),
        "readonly" => "readOnly".to_string(),
        "maxlength" => "maxLength".to_string(),
        "cellpadding" => "cellPadding".to_string(),
        "cellspacing" => "cellSpacing".to_string(),
        "colspan" => "colSpan".to_string(),
        "rowspan" => "rowSpan".to_string(),
        "usemap" => "useMap".to_string(),
        "frameborder" => "frameBorder".to_string(),
        "contenteditable" => "contentEditable".to_string(),
        "autocomplete" => "autoComplete".to_string(),
        "autofocus" => "autoFocus".to_string(),
        "autoplay" => "autoPlay".to_string(),
        _ if name.starts_with("data-") || name.starts_with("aria-") => name.to_string(),
        _ => name.to_string(),
    }
}

/// Escape text for JSX
fn escape_jsx_text(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
        .trim()
        .to_string()
}

/// Add JSX runtime import
fn add_jsx_import(source: &str, options: &TransformOptions) -> String {
    let import_stmt = format!(
        "import {{ jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment }} from \"{}/jsx-runtime\";\n",
        options.jsx_import_source
    );
    format!("{}{}", import_stmt, source)
}

/// Quick minification
fn quick_minify(source: &str) -> String {
    let mut result = source.to_string();
    
    // Remove single-line comments
    let comment_re = regex::Regex::new(r"(?m)//[^\n]*$").unwrap();
    result = comment_re.replace_all(&result, "").to_string();
    
    // Remove multi-line comments
    let multi_comment_re = regex::Regex::new(r"/\*[\s\S]*?\*/").unwrap();
    result = multi_comment_re.replace_all(&result, "").to_string();
    
    // Collapse whitespace
    let whitespace_re = regex::Regex::new(r"\s+").unwrap();
    result = whitespace_re.replace_all(&result, " ").to_string();
    
    // Remove spaces around operators
    let operators_re = regex::Regex::new(r"\s*([=+\-*/<>!&|,;:{}()\[\]])\s*").unwrap();
    result = operators_re.replace_all(&result, "$1").to_string();
    
    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remove_type_annotation() {
        let source = "const x: number = 5;";
        let (result, had_types) = remove_typescript_types(source);
        assert!(had_types);
        assert!(!result.contains(": number"));
        assert!(result.contains("const x"));
    }

    #[test]
    fn test_remove_interface() {
        let source = "interface Props { name: string; }\nconst x = 1;";
        let (result, had_types) = remove_typescript_types(source);
        assert!(had_types);
        assert!(!result.contains("interface"));
        assert!(result.contains("const x = 1"));
    }

    #[test]
    fn test_remove_type_import() {
        let source = "import type { Props } from './types';\nimport React from 'react';";
        let (result, had_types) = remove_typescript_types(source);
        assert!(had_types);
        assert!(!result.contains("import type"));
        assert!(result.contains("import React"));
    }

    #[test]
    fn test_jsx_transform_simple() {
        let source = "<div>Hello</div>";
        let options = TransformOptions::default();
        let (result, had_jsx) = transform_jsx(source, &options);
        assert!(had_jsx);
        assert!(result.contains("_jsx"));
        assert!(result.contains("\"div\""));
    }

    #[test]
    fn test_jsx_transform_with_props() {
        let source = "<div className=\"test\" id={myId}>Hello</div>";
        let options = TransformOptions::default();
        let (result, had_jsx) = transform_jsx(source, &options);
        assert!(had_jsx);
        assert!(result.contains("className: \"test\""));
        assert!(result.contains("id: myId"));
    }

    #[test]
    fn test_jsx_transform_component() {
        let source = "<MyComponent name=\"test\" />";
        let options = TransformOptions::default();
        let (result, had_jsx) = transform_jsx(source, &options);
        assert!(had_jsx);
        assert!(result.contains("MyComponent"));
        assert!(!result.contains("\"MyComponent\""));
    }

    #[test]
    fn test_jsx_fragment() {
        let source = "<>Hello</>";
        let options = TransformOptions::default();
        let (result, had_jsx) = transform_jsx(source, &options);
        assert!(had_jsx);
        assert!(result.contains("_Fragment"));
    }

    #[test]
    fn test_full_transform() {
        let source = r#"
            interface Props { name: string; }
            const Component: React.FC<Props> = ({ name }) => {
                return <div className="test">{name}</div>;
            };
        "#;
        let options = TransformOptions::default();
        let result = transform_internal(source, "test.tsx", &options);
        assert!(result.had_types);
        assert!(result.had_jsx);
        assert!(!result.code.contains("interface"));
        assert!(result.code.contains("_jsx"));
    }
}
