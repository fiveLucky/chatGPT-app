import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    openai?: {
      toolInput?: { a: number; b: number };
      toolOutput?: { a: number; b: number; result: number };
      callTool?: (name: string, args: any) => Promise<any>;
      setWidgetState?: (state: any) => void;
      widgetState?: any;
    };
  }
}

const MultiplyCalculator = () => {
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const [result, setResult] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const toolInput = window.openai?.toolInput;
    const toolOutput = window.openai?.toolOutput;

    if (toolInput) {
      setA(String(toolInput.a));
      setB(String(toolInput.b));
    }

    if (toolOutput) {
      setA(String(toolOutput.a));
      setB(String(toolOutput.b));
      setResult(toolOutput.result);
    }
  }, []);

  const handleCalculate = async () => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);

    if (isNaN(numA) || isNaN(numB)) {
      setResult(null);
      return;
    }

    setLoading(true);
    try {
      if (window.openai?.callTool) {
        const response = await window.openai.callTool('multiply', { a: numA, b: numB });
        const resultValue = typeof response === 'string'
          ? parseFloat(response)
          : response?.result || numA * numB;
        setResult(resultValue);
        window.openai?.setWidgetState?.({ lastResult: resultValue });
      } else {
        const product = numA * numB;
        setResult(product);
        window.openai?.setWidgetState?.({ lastResult: product });
      }
    } catch (err) {
      console.error(err);
      setResult(numA * numB);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      padding: '20px',
      borderRadius: '8px',
      background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      color: 'white',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      <h2 style={{ marginTop: 0, fontSize: '20px', marginBottom: '20px', textAlign: 'center' }}>
        ✖️ Multiplication Calculator
      </h2>

      <div style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.2)', padding: '16px', borderRadius: '8px' }}>
        <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px', fontWeight: 500 }}>
          First Number (a)
        </label>
        <input
          type="number"
          value={a}
          onChange={(e) => setA(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleCalculate()}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: '2px solid rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.9)',
            fontSize: '16px',
            boxSizing: 'border-box'
          }}
          placeholder="Enter first number"
        />
      </div>

      <div style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.2)', padding: '16px', borderRadius: '8px' }}>
        <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px', fontWeight: 500 }}>
          Second Number (b)
        </label>
        <input
          type="number"
          value={b}
          onChange={(e) => setB(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleCalculate()}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: '2px solid rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.9)',
            fontSize: '16px',
            boxSizing: 'border-box'
          }}
          placeholder="Enter second number"
        />
      </div>

      <button
        onClick={handleCalculate}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: 'rgba(255,255,255,0.9)',
          color: '#4facfe',
          border: 'none',
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
          fontWeight: 600,
          fontSize: '16px',
          marginBottom: '16px'
        }}
      >
        {loading ? 'Calculating...' : 'Calculate Product'}
      </button>

      {result !== null && (
        <div style={{
          background: 'rgba(255,255,255,0.2)',
          padding: '16px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>Result</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
            {a} × {b} = {result}
          </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('multiply-root');
if (container) {
  const root = createRoot(container);
  root.render(<MultiplyCalculator />);
}

