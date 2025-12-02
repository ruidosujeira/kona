//! Fast JavaScript/TypeScript parser for import extraction
//!
//! Minimal parser focused on:
//! - Static imports: import x from 'y'
//! - Dynamic imports: import('y')
//! - Exports: export { x } from 'y'
//! - require(): require('y')
//! - JSX detection
//! - Top-level await detection

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

/// Import information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportInfo {
    /// The import source/path
    pub source: String,
    /// Is this a dynamic import?
    pub is_dynamic: bool,
    /// Is this a type-only import?
    pub is_type_only: bool,
    /// Start position in source
    pub start: usize,
    /// End position in source
    pub end: usize,
}

/// Parse result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResult {
    /// All imports found
    pub imports: Vec<ImportInfo>,
    /// Has JSX syntax
    pub has_jsx: bool,
    /// Has top-level await
    pub has_top_level_await: bool,
    /// Is TypeScript
    pub is_typescript: bool,
    /// Parse time in microseconds
    pub parse_time_us: u64,
}

/// Token types for lexer
#[derive(Debug, Clone, Copy, PartialEq)]
enum Token {
    Import,
    Export,
    From,
    Require,
    Await,
    Type,
    StringLiteral,
    OpenParen,
    CloseParen,
    OpenBrace,
    CloseBrace,
    Semicolon,
    Comma,
    Star,
    As,
    Identifier,
    JSXOpen,
    EOF,
    Other,
}

/// Fast lexer for JavaScript/TypeScript
struct Lexer<'a> {
    source: &'a [u8],
    pos: usize,
    len: usize,
}

impl<'a> Lexer<'a> {
    fn new(source: &'a str) -> Self {
        let bytes = source.as_bytes();
        Self {
            source: bytes,
            pos: 0,
            len: bytes.len(),
        }
    }

    #[inline]
    fn peek(&self) -> u8 {
        if self.pos < self.len {
            self.source[self.pos]
        } else {
            0
        }
    }

    #[inline]
    fn peek_n(&self, n: usize) -> u8 {
        let pos = self.pos + n;
        if pos < self.len {
            self.source[pos]
        } else {
            0
        }
    }

    #[inline]
    fn advance(&mut self) {
        self.pos += 1;
    }

    #[inline]
    fn advance_n(&mut self, n: usize) {
        self.pos += n;
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.len {
            match self.peek() {
                b' ' | b'\t' | b'\n' | b'\r' => self.advance(),
                b'/' => {
                    if self.peek_n(1) == b'/' {
                        // Single-line comment
                        self.advance_n(2);
                        while self.pos < self.len && self.peek() != b'\n' {
                            self.advance();
                        }
                    } else if self.peek_n(1) == b'*' {
                        // Multi-line comment
                        self.advance_n(2);
                        while self.pos < self.len {
                            if self.peek() == b'*' && self.peek_n(1) == b'/' {
                                self.advance_n(2);
                                break;
                            }
                            self.advance();
                        }
                    } else {
                        break;
                    }
                }
                _ => break,
            }
        }
    }

    fn read_string(&mut self) -> Option<String> {
        let quote = self.peek();
        if quote != b'"' && quote != b'\'' && quote != b'`' {
            return None;
        }
        
        self.advance(); // skip opening quote
        let start = self.pos;
        
        while self.pos < self.len {
            let ch = self.peek();
            if ch == quote {
                let s = String::from_utf8_lossy(&self.source[start..self.pos]).to_string();
                self.advance(); // skip closing quote
                return Some(s);
            }
            if ch == b'\\' {
                self.advance(); // skip escape
            }
            self.advance();
        }
        
        None
    }

    fn read_identifier(&mut self) -> String {
        let start = self.pos;
        while self.pos < self.len {
            let ch = self.peek();
            if ch.is_ascii_alphanumeric() || ch == b'_' || ch == b'$' {
                self.advance();
            } else {
                break;
            }
        }
        String::from_utf8_lossy(&self.source[start..self.pos]).to_string()
    }

    fn check_keyword(&self, keyword: &[u8]) -> bool {
        let len = keyword.len();
        if self.pos + len > self.len {
            return false;
        }
        
        // Check if matches keyword
        if &self.source[self.pos..self.pos + len] != keyword {
            return false;
        }
        
        // Check it's not part of a larger identifier
        if self.pos + len < self.len {
            let next = self.source[self.pos + len];
            if next.is_ascii_alphanumeric() || next == b'_' || next == b'$' {
                return false;
            }
        }
        
        true
    }

    fn next_token(&mut self) -> (Token, usize, Option<String>) {
        self.skip_whitespace();
        
        if self.pos >= self.len {
            return (Token::EOF, self.pos, None);
        }

        let start = self.pos;
        let ch = self.peek();

        // Keywords
        if self.check_keyword(b"import") {
            self.advance_n(6);
            return (Token::Import, start, None);
        }
        if self.check_keyword(b"export") {
            self.advance_n(6);
            return (Token::Export, start, None);
        }
        if self.check_keyword(b"from") {
            self.advance_n(4);
            return (Token::From, start, None);
        }
        if self.check_keyword(b"require") {
            self.advance_n(7);
            return (Token::Require, start, None);
        }
        if self.check_keyword(b"await") {
            self.advance_n(5);
            return (Token::Await, start, None);
        }
        if self.check_keyword(b"type") {
            self.advance_n(4);
            return (Token::Type, start, None);
        }
        if self.check_keyword(b"as") {
            self.advance_n(2);
            return (Token::As, start, None);
        }

        // String literals
        if ch == b'"' || ch == b'\'' || ch == b'`' {
            if let Some(s) = self.read_string() {
                return (Token::StringLiteral, start, Some(s));
            }
        }

        // Single character tokens
        match ch {
            b'(' => { self.advance(); return (Token::OpenParen, start, None); }
            b')' => { self.advance(); return (Token::CloseParen, start, None); }
            b'{' => { self.advance(); return (Token::OpenBrace, start, None); }
            b'}' => { self.advance(); return (Token::CloseBrace, start, None); }
            b';' => { self.advance(); return (Token::Semicolon, start, None); }
            b',' => { self.advance(); return (Token::Comma, start, None); }
            b'*' => { self.advance(); return (Token::Star, start, None); }
            b'<' => {
                // Check for JSX
                if self.peek_n(1).is_ascii_alphabetic() || self.peek_n(1) == b'/' {
                    self.advance();
                    return (Token::JSXOpen, start, None);
                }
            }
            _ => {}
        }

        // Identifier
        if ch.is_ascii_alphabetic() || ch == b'_' || ch == b'$' {
            let ident = self.read_identifier();
            return (Token::Identifier, start, Some(ident));
        }

        // Skip unknown character
        self.advance();
        (Token::Other, start, None)
    }
}

/// Main parser
#[wasm_bindgen]
pub struct Parser {
    // No state needed
}

#[wasm_bindgen]
impl Parser {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {}
    }

    /// Extract imports from source code
    #[wasm_bindgen]
    pub fn extract_imports(&self, source: &str) -> JsValue {
        let result = extract_imports_internal(source);
        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    /// Extract import sources only (faster, returns array of strings)
    #[wasm_bindgen]
    pub fn extract_import_sources(&self, source: &str) -> Vec<JsValue> {
        extract_imports_internal(source)
            .into_iter()
            .map(|i| JsValue::from_str(&i.source))
            .collect()
    }

    /// Fast import extraction - returns newline-separated string
    #[wasm_bindgen]
    pub fn extract_imports_fast(&self, source: &str) -> String {
        extract_imports_internal(source)
            .into_iter()
            .map(|i| i.source)
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Quick check if source has JSX
    #[wasm_bindgen]
    pub fn has_jsx(&self, source: &str) -> bool {
        has_jsx_internal(source)
    }

    /// Quick check if source has top-level await
    #[wasm_bindgen]
    pub fn has_top_level_await(&self, source: &str) -> bool {
        has_top_level_await_internal(source)
    }

    /// Full parse
    #[wasm_bindgen]
    pub fn parse(&self, source: &str) -> JsValue {
        let result = parse_internal(source);
        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }
}

/// Extract all imports from source
pub fn extract_imports_internal(source: &str) -> Vec<ImportInfo> {
    let mut imports = Vec::new();
    let mut lexer = Lexer::new(source);
    
    loop {
        let (token, start, value) = lexer.next_token();
        
        match token {
            Token::EOF => break,
            
            Token::Import => {
                // import ... from 'source'
                // import('source')
                // import type ... from 'source'
                let mut is_type_only = false;
                let mut is_dynamic = false;
                
                let (next_token, _, next_value) = lexer.next_token();
                
                match next_token {
                    Token::OpenParen => {
                        // Dynamic import: import('source')
                        is_dynamic = true;
                        let (str_token, _, str_value) = lexer.next_token();
                        if str_token == Token::StringLiteral {
                            if let Some(source) = str_value {
                                imports.push(ImportInfo {
                                    source,
                                    is_dynamic: true,
                                    is_type_only: false,
                                    start,
                                    end: lexer.pos,
                                });
                            }
                        }
                    }
                    Token::Type => {
                        // import type { ... } from 'source'
                        is_type_only = true;
                        // Continue to find 'from'
                        loop {
                            let (t, _, v) = lexer.next_token();
                            match t {
                                Token::From => {
                                    let (str_token, _, str_value) = lexer.next_token();
                                    if str_token == Token::StringLiteral {
                                        if let Some(source) = str_value {
                                            imports.push(ImportInfo {
                                                source,
                                                is_dynamic: false,
                                                is_type_only: true,
                                                start,
                                                end: lexer.pos,
                                            });
                                        }
                                    }
                                    break;
                                }
                                Token::EOF | Token::Semicolon => break,
                                _ => continue,
                            }
                        }
                    }
                    Token::StringLiteral => {
                        // import 'source' (side-effect import)
                        if let Some(source) = next_value {
                            imports.push(ImportInfo {
                                source,
                                is_dynamic: false,
                                is_type_only: false,
                                start,
                                end: lexer.pos,
                            });
                        }
                    }
                    _ => {
                        // import x from 'source'
                        // import { x } from 'source'
                        // import * as x from 'source'
                        loop {
                            let (t, _, v) = lexer.next_token();
                            match t {
                                Token::From => {
                                    let (str_token, _, str_value) = lexer.next_token();
                                    if str_token == Token::StringLiteral {
                                        if let Some(source) = str_value {
                                            imports.push(ImportInfo {
                                                source,
                                                is_dynamic: false,
                                                is_type_only: false,
                                                start,
                                                end: lexer.pos,
                                            });
                                        }
                                    }
                                    break;
                                }
                                Token::EOF | Token::Semicolon => break,
                                _ => continue,
                            }
                        }
                    }
                }
            }
            
            Token::Export => {
                // export { x } from 'source'
                // export * from 'source'
                // export default ...
                loop {
                    let (t, _, _v) = lexer.next_token();
                    match t {
                        Token::From => {
                            let (str_token, _, str_value) = lexer.next_token();
                            if str_token == Token::StringLiteral {
                                if let Some(source) = str_value {
                                    imports.push(ImportInfo {
                                        source,
                                        is_dynamic: false,
                                        is_type_only: false,
                                        start,
                                        end: lexer.pos,
                                    });
                                }
                            }
                            break;
                        }
                        Token::EOF | Token::Semicolon => break,
                        // Don't break on Identifier - continue looking for 'from'
                        _ => continue,
                    }
                }
            }
            
            Token::Require => {
                // require('source')
                let (paren_token, _, _) = lexer.next_token();
                if paren_token == Token::OpenParen {
                    let (str_token, _, str_value) = lexer.next_token();
                    if str_token == Token::StringLiteral {
                        if let Some(source) = str_value {
                            imports.push(ImportInfo {
                                source,
                                is_dynamic: false,
                                is_type_only: false,
                                start,
                                end: lexer.pos,
                            });
                        }
                    }
                }
            }
            
            _ => continue,
        }
    }
    
    imports
}

/// Check if source contains JSX
pub fn has_jsx_internal(source: &str) -> bool {
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    
    while i < len {
        // Skip strings
        if bytes[i] == b'"' || bytes[i] == b'\'' || bytes[i] == b'`' {
            let quote = bytes[i];
            i += 1;
            while i < len && bytes[i] != quote {
                if bytes[i] == b'\\' { i += 1; }
                i += 1;
            }
            i += 1;
            continue;
        }
        
        // Skip comments
        if bytes[i] == b'/' {
            if i + 1 < len && bytes[i + 1] == b'/' {
                while i < len && bytes[i] != b'\n' { i += 1; }
                continue;
            }
            if i + 1 < len && bytes[i + 1] == b'*' {
                i += 2;
                while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') { i += 1; }
                i += 2;
                continue;
            }
        }
        
        // Check for JSX: <Component or </Component or <>
        if bytes[i] == b'<' {
            if i + 1 < len {
                let next = bytes[i + 1];
                // <Component (uppercase)
                if next.is_ascii_uppercase() {
                    return true;
                }
                // </
                if next == b'/' {
                    return true;
                }
                // <> (fragment)
                if next == b'>' {
                    return true;
                }
                // Check for lowercase tags that aren't comparison
                if next.is_ascii_lowercase() {
                    // Look ahead for > or attributes
                    let mut j = i + 2;
                    while j < len && (bytes[j].is_ascii_alphanumeric() || bytes[j] == b'-') {
                        j += 1;
                    }
                    // Skip whitespace
                    while j < len && (bytes[j] == b' ' || bytes[j] == b'\t') {
                        j += 1;
                    }
                    // If followed by > or attribute, it's JSX
                    if j < len && (bytes[j] == b'>' || bytes[j] == b'/' || bytes[j].is_ascii_alphabetic()) {
                        return true;
                    }
                }
            }
        }
        
        i += 1;
    }
    
    false
}

/// Check if source has top-level await
pub fn has_top_level_await_internal(source: &str) -> bool {
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut brace_depth: i32 = 0;
    let mut paren_depth: i32 = 0;
    
    while i < len {
        // Skip strings
        if bytes[i] == b'"' || bytes[i] == b'\'' || bytes[i] == b'`' {
            let quote = bytes[i];
            i += 1;
            while i < len && bytes[i] != quote {
                if bytes[i] == b'\\' { i += 1; }
                i += 1;
            }
            i += 1;
            continue;
        }
        
        // Track braces
        if bytes[i] == b'{' { brace_depth += 1; }
        if bytes[i] == b'}' { brace_depth = brace_depth.saturating_sub(1); }
        if bytes[i] == b'(' { paren_depth += 1; }
        if bytes[i] == b')' { paren_depth = paren_depth.saturating_sub(1); }
        
        // Check for 'await' at top level (brace_depth == 0)
        if brace_depth == 0 && i + 5 <= len {
            if &bytes[i..i+5] == b"await" {
                // Make sure it's not part of a larger word
                let before_ok = i == 0 || !bytes[i-1].is_ascii_alphanumeric();
                let after_ok = i + 5 >= len || !bytes[i+5].is_ascii_alphanumeric();
                if before_ok && after_ok {
                    return true;
                }
            }
        }
        
        i += 1;
    }
    
    false
}

/// Full parse
pub fn parse_internal(source: &str) -> ParseResult {
    let imports = extract_imports_internal(source);
    let has_jsx = has_jsx_internal(source);
    let has_top_level_await = has_top_level_await_internal(source);
    let is_typescript = source.contains(": ") || source.contains("interface ") || 
                        source.contains("type ") || source.contains("<T>");
    
    ParseResult {
        imports,
        has_jsx,
        has_top_level_await,
        is_typescript,
        parse_time_us: 0, // Time measurement not available in WASM
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_static_import() {
        let source = r#"import React from 'react';"#;
        let imports = extract_imports_internal(source);
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].source, "react");
        assert!(!imports[0].is_dynamic);
    }

    #[test]
    fn test_named_import() {
        let source = r#"import { useState, useEffect } from 'react';"#;
        let imports = extract_imports_internal(source);
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].source, "react");
    }

    #[test]
    fn test_dynamic_import() {
        let source = r#"const mod = import('./module');"#;
        let imports = extract_imports_internal(source);
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].source, "./module");
        assert!(imports[0].is_dynamic);
    }

    #[test]
    fn test_type_import() {
        let source = r#"import type { Props } from './types';"#;
        let imports = extract_imports_internal(source);
        assert_eq!(imports.len(), 1);
        assert!(imports[0].is_type_only);
    }

    #[test]
    fn test_require() {
        let source = r#"const fs = require('fs');"#;
        let imports = extract_imports_internal(source);
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].source, "fs");
    }

    #[test]
    fn test_export_from() {
        let source = r#"export { foo } from './foo';"#;
        let imports = extract_imports_internal(source);
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].source, "./foo");
    }

    #[test]
    fn test_has_jsx() {
        assert!(has_jsx_internal("<div>hello</div>"));
        assert!(has_jsx_internal("<Component />"));
        assert!(has_jsx_internal("<>fragment</>"));
        assert!(!has_jsx_internal("a < b && c > d"));
    }

    #[test]
    fn test_top_level_await() {
        assert!(has_top_level_await_internal("const x = await fetch()"));
        assert!(!has_top_level_await_internal("async function f() { await x }"));
    }

    #[test]
    fn test_multiple_imports() {
        let source = r#"
            import React from 'react';
            import { useState } from 'react';
            import './styles.css';
            const lazy = import('./lazy');
            export { foo } from './foo';
        "#;
        let imports = extract_imports_internal(source);
        assert_eq!(imports.len(), 5);
    }
}
