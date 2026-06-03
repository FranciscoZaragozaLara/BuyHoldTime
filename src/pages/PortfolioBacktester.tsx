import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ALL_TICKERS, generateHistoricalData } from '../data/historicalData';
import { Briefcase, RefreshCw } from 'lucide-react';

interface BacktestPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}

export const PortfolioBacktester: React.FC = () => {
  const [asset1, setAsset1] = useState('VOO');
  const [asset2, setAsset2] = useState('QQQ');
  const [weight1, setWeight1] = useState(50); // percentage weight of asset 1
  const [initialAmt] = useState(10000);
  const [backtestResults, setBacktestResults] = useState<BacktestPoint[]>([]);
  const [metrics, setMetrics] = useState({
    portFinal: 0,
    benchFinal: 0,
    portReturn: 0,
    benchReturn: 0,
    alpha: 0
  });

  const weight2 = 100 - weight1;

  // Filter available stocks/ETFs
  const tickers = ALL_TICKERS.filter(t => t.symbol !== 'SPY'); // benchmark is SPY

  const runBacktest = () => {
    const data1 = generateHistoricalData(asset1);
    const data2 = generateHistoricalData(asset2);
    const benchData = generateHistoricalData('SPY');

    if (data1.length === 0 || data2.length === 0 || benchData.length === 0) return;

    // Use minimum length to align dates
    const length = Math.min(data1.length, data2.length, benchData.length);
    const alignedData1 = data1.slice(-length);
    const alignedData2 = data2.slice(-length);
    const alignedBench = benchData.slice(-length);

    // Initial shares
    const initVal1 = alignedData1[0].open;
    const initVal2 = alignedData2[0].open;
    const initBenchVal = alignedBench[0].open;

    const shares1 = (initialAmt * (weight1 / 100)) / initVal1;
    const shares2 = (initialAmt * (weight2 / 100)) / initVal2;
    const benchShares = initialAmt / initBenchVal;

    const history: BacktestPoint[] = [];

    for (let i = 0; i < length; i++) {
      // Sample every 5 days to avoid chart clutter and improve animation performance
      if (i % 5 !== 0 && i !== length - 1) continue;

      const date = alignedData1[i].time;
      const portVal = (shares1 * alignedData1[i].close) + (shares2 * alignedData2[i].close);
      const benchVal = benchShares * alignedBench[i].close;

      history.push({
        date,
        portfolio: parseFloat(portVal.toFixed(2)),
        benchmark: parseFloat(benchVal.toFixed(2))
      });
    }

    const finalPort = history[history.length - 1].portfolio;
    const finalBench = history[history.length - 1].benchmark;
    const portRet = ((finalPort - initialAmt) / initialAmt) * 100;
    const benchRet = ((finalBench - initialAmt) / initialAmt) * 100;

    setBacktestResults(history);
    setMetrics({
      portFinal: finalPort,
      benchFinal: finalBench,
      portReturn: parseFloat(portRet.toFixed(2)),
      benchReturn: parseFloat(benchRet.toFixed(2)),
      alpha: parseFloat((portRet - benchRet).toFixed(2))
    });
  };

  useEffect(() => {
    runBacktest();
  }, [asset1, asset2, weight1]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} className="animate-fade-in">
      
      {/* Intro */}
      <section className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{
          background: 'rgba(139, 92, 246, 0.1)',
          padding: '1rem',
          borderRadius: '12px',
          color: '#8b5cf6'
        }}>
          <Briefcase size={32} />
        </div>
        <div style={{ flex: 1, minWidth: '280px' }}>
          <h2 style={{ fontSize: '1.6rem' }}>Simulador de Portafolio (Backtester)</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>
            Arma una cartera simulada con dos activos recomendados, ajusta sus ponderaciones y compara su crecimiento histórico contra el S&P 500 en los últimos 2 años.
          </p>
        </div>
      </section>

      {/* Main Grid: Control & Results */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }} className="grid-cols-2">
        
        {/* Cartera Controls */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
            Configurar Ponderación
          </h3>

          {/* Activo 1 */}
          <div className="form-group">
            <label className="form-label">Activo 1</label>
            <select 
              value={asset1} 
              onChange={(e) => setAsset1(e.target.value)} 
              className="form-input"
              style={{ background: 'var(--bg-primary)' }}
            >
              {tickers.map(t => (
                <option key={t.symbol} value={t.symbol} disabled={t.symbol === asset2}>
                  {t.symbol} - {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Slider for weights */}
          <div className="form-group" style={{ margin: '1rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
              <span style={{ color: 'var(--accent-primary)' }}>{asset1}: {weight1}%</span>
              <span style={{ color: '#8b5cf6' }}>{asset2}: {weight2}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weight1}
              onChange={(e) => setWeight1(parseInt(e.target.value))}
              style={{
                width: '100%',
                accentColor: 'var(--accent-primary)',
                cursor: 'pointer',
                marginTop: '0.5rem'
              }}
            />
          </div>

          {/* Activo 2 */}
          <div className="form-group">
            <label className="form-label">Activo 2</label>
            <select 
              value={asset2} 
              onChange={(e) => setAsset2(e.target.value)} 
              className="form-input"
              style={{ background: 'var(--bg-primary)' }}
            >
              {tickers.map(t => (
                <option key={t.symbol} value={t.symbol} disabled={t.symbol === asset1}>
                  {t.symbol} - {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sim Details Summary */}
          <div style={{
            background: 'var(--bg-tertiary)',
            padding: '1rem',
            borderRadius: '10px',
            border: '1px solid var(--glass-border)',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)'
          }}>
            <p>Monto Inicial: <strong>$10,000 USD</strong></p>
            <p style={{ marginTop: '0.25rem' }}>Horizonte: <strong>2 Años Históricos</strong></p>
            <p style={{ marginTop: '0.25rem' }}>Benchmark: <strong>S&P 500 Index (SPY)</strong></p>
          </div>

          <button onClick={runBacktest} className="btn btn-primary">
            <RefreshCw size={16} />
            Recalcular Simulación
          </button>
        </div>

        {/* Backtest Results Screen */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Top Return Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }} className="grid-cols-3">
            
            {/* Port Ret Card */}
            <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tu Portafolio</span>
              <h4 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem' }}>${metrics.portFinal.toLocaleString()}</h4>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: metrics.portReturn >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
                {metrics.portReturn >= 0 ? '+' : ''}{metrics.portReturn}%
              </span>
            </div>

            {/* Bench Ret Card */}
            <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>S&P 500 (SPY)</span>
              <h4 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem' }}>${metrics.benchFinal.toLocaleString()}</h4>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: metrics.benchReturn >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
                {metrics.benchReturn >= 0 ? '+' : ''}{metrics.benchReturn}%
              </span>
            </div>

            {/* Alpha Card */}
            <div style={{ 
              background: 'var(--bg-tertiary)', 
              padding: '1rem', 
              borderRadius: '10px', 
              border: `1px solid ${metrics.alpha >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
            }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Retorno Alpha (vs SPY)</span>
              <h4 style={{ 
                fontSize: '1.4rem', 
                fontWeight: 800, 
                marginTop: '0.25rem', 
                color: metrics.alpha >= 0 ? 'var(--strong-buy)' : 'var(--strong-sell)' 
              }}>
                {metrics.alpha >= 0 ? '+' : ''}{metrics.alpha}%
              </h4>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Desempeño Extra</span>
            </div>

          </div>

          {/* Line Chart comparing Growth */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Crecimiento de $10,000 en el tiempo
            </span>
            <div style={{ height: '260px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={backtestResults} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                  <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{ background: 'var(--bg-tertiary)', borderColor: 'var(--glass-border)', borderRadius: '8px' }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="portfolio" 
                    name="Tu Portafolio" 
                    stroke="var(--accent-primary)" 
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="benchmark" 
                    name="S&P 500 Index" 
                    stroke="#e11d48" // Rose
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </section>

    </div>
  );
};
