import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// Define window.openai types
declare global {
  interface Window {
    openai?: {
      toolOutput?: any;
      callTool?: (name: string, args: any) => Promise<any>;
      requestDisplayMode?: (options: { mode: 'inline' | 'fullscreen' | 'pip' }) => Promise<void>;
      setWidgetState?: (state: any) => void;
      widgetState?: any;
    };
  }
}

const App = () => {
  const [a, setA] = useState<string>('10');
  const [b, setB] = useState<string>('5');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Example of using window.openai to get initial data or state
  useEffect(() => {
    if (window.openai?.toolOutput) {
       console.log("Received tool output:", window.openai.toolOutput);
    }
  }, []);

  const handleCalculate = async () => {
    setLoading(true);
    setResult(null);

    try {
      // In a real App SDK scenario, we might call the tool back via window.openai
      // or call our backend API directly if CORS allows.
      // Option A: Call MCP tool via window.openai (The "ChatGPT way")
      if (window.openai?.callTool) {
        // This assumes 'calculate_sum' is available to the client context
        // Note: The model calls tools, but widgets can sometimes trigger them too via client actions
        // However, for this demo, let's stick to calling our backend API directly
        // because we are just a UI for the MCP server.
      }

      // Option B: Direct API call to our backend (Standard Web App way)
      // Since this component is loaded in an iframe served from the same domain (ideally),
      // relative paths work.
      const numA = parseFloat(a);
      const numB = parseFloat(b);

      if (isNaN(numA) || isNaN(numB)) {
        setResult("Invalid input");
        return;
      }

      // Use absolute URL for production to ensure correct routing in iframe
      const response = await fetch('https://calculate-sum.zeabur.app/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a: numA, b: numB })
      });

      const data = await response.json();
      setResult(data.result);

      // Sync state with ChatGPT (optional)
      window.openai?.setWidgetState?.({ lastResult: data.result });

    } catch (err) {
      console.error(err);
      setResult("Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      padding: '16px',
      border: '1px solid #e5e5e5',
      borderRadius: '8px',
      background: 'white',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      <h2 style={{ marginTop: 0, fontSize: '18px', marginBottom: '16px' }}>Calculator Widget</h2>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>First Number</label>
        <input
          type="number"
          value={a}
          onChange={(e) => setA(e.target.value)}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Second Number</label>
        <input
          type="number"
          value={b}
          onChange={(e) => setB(e.target.value)}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }}
        />
      </div>

      <button
        onClick={handleCalculate}
        disabled={loading}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: '#10a37f',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
          fontWeight: 500
        }}
      >
        {loading ? 'Calculating...' : 'Calculate Sum'}
      </button>

      {result !== null && (
        <div style={{ marginTop: '16px', textAlign: 'center', fontWeight: 'bold' }}>
          Result: {result}
        </div>
      )}
    </div>
  );
};

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

