import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ 
      fontFamily: 'system-ui', 
      padding: '2rem', 
      textAlign: 'center',
      background: '#0a0a0a',
      color: '#fff',
      minHeight: '100vh',
    }}>
      <h1>⚡ Kona Test App</h1>
      <p>Edit src/App.tsx and save to test HMR</p>
      <button 
        onClick={() => setCount(c => c + 1)}
        style={{
          background: '#00d4ff',
          color: '#000',
          border: 'none',
          padding: '1rem 2rem',
          fontSize: '1.2rem',
          borderRadius: '8px',
          cursor: 'pointer',
          marginTop: '1rem',
        }}
      >
        Count: {count}
      </button>
    </div>
  );
}
