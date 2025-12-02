//! Criterion benchmarks for Kona WASM modules
//!
//! Run with: cargo bench

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};

// Import our modules
use kona_wasm::parser::*;
use kona_wasm::transformer::*;

/// Sample TypeScript/React code for benchmarking
fn sample_tsx_code(components: usize) -> String {
    let mut code = String::new();
    
    // Imports
    code.push_str("import React, { useState, useEffect, useCallback } from 'react';\n");
    code.push_str("import { useQuery } from '@tanstack/react-query';\n");
    code.push_str("import type { User, Post, Comment } from './types';\n");
    code.push_str("import './styles.css';\n\n");
    
    // Interface
    code.push_str("interface Props {\n");
    code.push_str("  id: number;\n");
    code.push_str("  name: string;\n");
    code.push_str("  onClick?: () => void;\n");
    code.push_str("}\n\n");
    
    // Components
    for i in 0..components {
        code.push_str(&format!(
            r#"export const Component{i}: React.FC<Props> = ({{ id, name, onClick }}) => {{
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {{
    console.log('Component {i} mounted');
    return () => console.log('Component {i} unmounted');
  }}, []);
  
  const handleClick = useCallback(() => {{
    setCount(c => c + 1);
    onClick?.();
  }}, [onClick]);
  
  return (
    <div className="component-{i}" onClick={{handleClick}}>
      <h2>{{name}}</h2>
      <p>Count: {{count}}</p>
      <span>ID: {{id}}</span>
    </div>
  );
}};

"#, i = i
        ));
    }
    
    code
}

fn bench_parser(c: &mut Criterion) {
    let mut group = c.benchmark_group("Parser");
    
    for size in [10, 50, 100].iter() {
        let code = sample_tsx_code(*size);
        
        group.bench_with_input(
            BenchmarkId::new("extract_imports", size),
            &code,
            |b, code| {
                b.iter(|| {
                    extract_imports_internal(black_box(code))
                })
            },
        );
        
        group.bench_with_input(
            BenchmarkId::new("has_jsx", size),
            &code,
            |b, code| {
                b.iter(|| {
                    has_jsx_internal(black_box(code))
                })
            },
        );
        
        group.bench_with_input(
            BenchmarkId::new("full_parse", size),
            &code,
            |b, code| {
                b.iter(|| {
                    parse_internal(black_box(code))
                })
            },
        );
    }
    
    group.finish();
}

fn bench_transformer(c: &mut Criterion) {
    let mut group = c.benchmark_group("Transformer");
    let options = TransformOptions::default();
    
    for size in [10, 50, 100].iter() {
        let code = sample_tsx_code(*size);
        
        group.bench_with_input(
            BenchmarkId::new("transform", size),
            &code,
            |b, code| {
                b.iter(|| {
                    transform_internal(black_box(code), "bench.tsx", &options)
                })
            },
        );
    }
    
    group.finish();
}

fn bench_real_world(c: &mut Criterion) {
    // Simulate real-world file sizes
    let small_file = sample_tsx_code(1);   // ~50 lines
    let medium_file = sample_tsx_code(10); // ~500 lines
    let large_file = sample_tsx_code(50);  // ~2500 lines
    
    let options = TransformOptions::default();
    
    let mut group = c.benchmark_group("RealWorld");
    
    group.bench_function("small_file_50_lines", |b| {
        b.iter(|| {
            let imports = extract_imports_internal(black_box(&small_file));
            transform_internal(black_box(&small_file), "small.tsx", &options)
        })
    });
    
    group.bench_function("medium_file_500_lines", |b| {
        b.iter(|| {
            let imports = extract_imports_internal(black_box(&medium_file));
            transform_internal(black_box(&medium_file), "medium.tsx", &options)
        })
    });
    
    group.bench_function("large_file_2500_lines", |b| {
        b.iter(|| {
            let imports = extract_imports_internal(black_box(&large_file));
            transform_internal(black_box(&large_file), "large.tsx", &options)
        })
    });
    
    group.finish();
}

criterion_group!(benches, bench_parser, bench_transformer, bench_real_world);
criterion_main!(benches);
