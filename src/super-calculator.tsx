import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    openai?: {
      toolInput?: { a: number; b: number; operation?: string };
      toolOutput?: { a: number; b: number; operation?: string; result: number };
      callTool?: (name: string, args: any) => Promise<any>;
      setWidgetState?: (state: any) => void;
      widgetState?: any;
    };
  }
}

type Operation = 'add' | 'subtract' | 'multiply' | 'divide';

const SuperCalculator = () => {
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const [operation, setOperation] = useState<Operation>('add');
  const [result, setResult] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ op: Operation; a: number; b: number; result: number }>>([]);

  useEffect(() => {
    const toolInput = window.openai?.toolInput;
    const toolOutput = window.openai?.toolOutput;

    if (toolInput) {
      setA(String(toolInput.a));
      setB(String(toolInput.b));
      if (toolInput.operation) {
        setOperation(toolInput.operation as Operation);
      }
    }

    if (toolOutput) {
      setA(String(toolOutput.a));
      setB(String(toolOutput.b));
      if (toolOutput.operation) {
        setOperation(toolOutput.operation as Operation);
      }
      setResult(toolOutput.result);
    }
  }, []);

  const handleCalculate = async () => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);

    if (isNaN(numA) || isNaN(numB)) {
      setResult(null);
      setError(null);
      return;
    }

    if (operation === 'divide' && numB === 0) {
      setError('Cannot divide by zero!');
      setResult(null);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      let resultValue: number;

      // Call the corresponding MCP tool
      if (window.openai?.callTool) {
        const response = await window.openai.callTool(operation, { a: numA, b: numB });
        resultValue = typeof response === 'string'
          ? parseFloat(response)
          : response?.result || calculateDirectly(numA, numB, operation);
      } else {
        resultValue = calculateDirectly(numA, numB, operation);
      }

      setResult(resultValue);
      setHistory(prev => [...prev.slice(-4), { op: operation, a: numA, b: numB, result: resultValue }]);
      window.openai?.setWidgetState?.({ lastResult: resultValue, operation });
    } catch (err) {
      console.error(err);
      const fallbackResult = calculateDirectly(numA, numB, operation);
      setResult(fallbackResult);
    } finally {
      setLoading(false);
    }
  };

  const calculateDirectly = (a: number, b: number, op: Operation): number => {
    switch (op) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return a / b;
      default: return 0;
    }
  };

  const getOperationSymbol = (op: Operation): string => {
    switch (op) {
      case 'add': return '+';
      case 'subtract': return '-';
      case 'multiply': return '×';
      case 'divide': return '÷';
    }
  };

  const getGradient = (op: Operation): string => {
    switch (op) {
      case 'add': return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      case 'subtract': return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
      case 'multiply': return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
      case 'divide': return 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)';
    }
  };

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      padding: '20px',
      borderRadius: '8px',
      background: getGradient(operation),
      color: 'white',
      maxWidth: '100%',
      boxSizing: 'border-box',
      transition: 'background 0.3s ease'
    }}>
      <h2 style={{ marginTop: 0, fontSize: '22px', marginBottom: '20px', textAlign: 'center' }}>
        🧮 Super Calculator
      </h2>

      <div style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.2)', padding: '16px', borderRadius: '8px' }}>
        <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px', fontWeight: 500 }}>
          Operation
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {(['add', 'subtract', 'multiply', 'divide'] as Operation[]).map((op) => (
            <button
              key={op}
              onClick={() => setOperation(op)}
              style={{
                padding: '10px',
                borderRadius: '6px',
                border: operation === op ? '2px solid white' : '2px solid rgba(255,255,255,0.3)',
                background: operation === op ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                color: 'white',
                cursor: 'pointer',
                fontWeight: operation === op ? 600 : 400,
                fontSize: '14px',
                textTransform: 'capitalize'
              }}
            >
              {getOperationSymbol(op)}
            </button>
          ))}
        </div>
      </div>

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
          color: '#333',
          border: 'none',
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
          fontWeight: 600,
          fontSize: '16px',
          marginBottom: '16px'
        }}
      >
        {loading ? 'Calculating...' : `Calculate ${operation.charAt(0).toUpperCase() + operation.slice(1)}`}
      </button>

      {error && (
        <div style={{
          background: 'rgba(255,0,0,0.3)',
          padding: '12px',
          borderRadius: '6px',
          textAlign: 'center',
          marginBottom: '16px',
          fontWeight: 500
        }}>
          ⚠️ {error}
        </div>
      )}

      {result !== null && (
        <div style={{
          background: 'rgba(255,255,255,0.2)',
          padding: '16px',
          borderRadius: '8px',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>Result</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
            {a} {getOperationSymbol(operation)} {b} = {operation === 'divide' ? result.toFixed(2) : result}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.15)',
          padding: '12px',
          borderRadius: '6px',
          marginTop: '16px'
        }}>
          <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '8px', fontWeight: 500 }}>
            Recent Calculations:
          </div>
          {history.map((item, idx) => (
            <div key={idx} style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>
              {item.a} {getOperationSymbol(item.op)} {item.b} = {item.result}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('super-calculator-root');
if (container) {
  const root = createRoot(container);
  root.render(<SuperCalculator />);
}

