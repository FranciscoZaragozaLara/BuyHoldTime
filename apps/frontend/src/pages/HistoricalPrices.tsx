import React, { useState, useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, AreaSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { Search, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ALL_TICKERS, generateHistoricalData, getYearlyPerformance } from '../data/historicalData';
import type { TickerInfo } from '../data/historicalData';

export const HistoricalPrices: React.FC = () => {
  const [selectedTicker, setSelectedTicker] = useState('SPY');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState('1Y'); // 1D, 1W, 1M, YTD, 1Y, 3Y, 5Y, 10Y
  const [chartType, setChartType] = useState<'candle' | 'area'>('area');
  const [filteredTickers, setFilteredTickers] = useState<TickerInfo[]>([]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | any | null>(null);

  const activeStock = ALL_TICKERS.find(t => t.symbol === selectedTicker) || ALL_TICKERS[0];
  const yearlyData = getYearlyPerformance(selectedTicker);

  // Search logic
  useEffect(() => {
    if (!searchQuery) {
      setFilteredTickers([]);
      return;
    }
    const filtered = ALL_TICKERS.filter(t => 
      t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 8);
    setFilteredTickers(filtered);
  }, [searchQuery]);

  // Chart setup
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 1, // Normal crosshair
        vertLine: { color: 'rgba(59, 130, 246, 0.4)', width: 1 },
        horzLine: { color: 'rgba(59, 130, 246, 0.4)', width: 1 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
      },
    });

    chartRef.current = chart;

    // Generate history
    const rawData = generateHistoricalData(selectedTicker);
    
    // Filter data based on time range (2 years back is approx 504 trading days)
    let chartData = [...rawData];
    if (timeRange === '1M') {
      chartData = rawData.slice(-21);
    } else if (timeRange === '1W') {
      chartData = rawData.slice(-5);
    } else if (timeRange === '1D') {
      chartData = rawData.slice(-1);
    } else if (timeRange === '3M') {
      chartData = rawData.slice(-63);
    } else if (timeRange === '6M') {
      chartData = rawData.slice(-126);
    } else if (timeRange === 'YTD') {
      const currentYear = new Date().getFullYear();
      chartData = rawData.filter(bar => new Date(bar.time).getFullYear() === currentYear);
    } else if (timeRange === '1Y') {
      chartData = rawData.slice(-252);
    } // 3Y, 5Y, 10Y will display full 2Y data in this prototype with a note

    if (chartType === 'candle') {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#34d399',
        downColor: '#ef4444',
        borderUpColor: '#34d399',
        borderDownColor: '#ef4444',
        wickUpColor: '#34d399',
        wickDownColor: '#ef4444',
      });
      candleSeries.setData(chartData);
      seriesRef.current = candleSeries as any;
    } else {
      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: '#3b82f6',
        topColor: 'rgba(59, 130, 246, 0.3)',
        bottomColor: 'rgba(59, 130, 246, 0.0)',
        lineWidth: 2,
      });
      areaSeries.setData(chartData.map(bar => ({ time: bar.time, value: bar.close })));
      seriesRef.current = areaSeries as any;
    }

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [selectedTicker, timeRange, chartType]);

  const getBuyHoldColor = (idx: number) => {
    if (idx >= 85) return 'var(--strong-buy)';
    if (idx >= 65) return 'var(--buy)';
    if (idx >= 45) return 'var(--hold)';
    if (idx >= 25) return 'var(--sell)';
    return 'var(--strong-sell)';
  };

  // Performace Calculation Helper (simulated metrics)
  const getSimulatedReturn = (range: string) => {
    const rawData = generateHistoricalData(selectedTicker);
    if (rawData.length === 0) return 0;
    
    const endPrice = rawData[rawData.length - 1].close;
    let startPrice = rawData[0].close;

    if (range === 'D') return activeStock.changePercent;
    if (range === 'W') startPrice = rawData[Math.max(0, rawData.length - 5)].close;
    else if (range === 'M') startPrice = rawData[Math.max(0, rawData.length - 21)].close;
    else if (range === 'YTD') {
      const currentYear = new Date().getFullYear();
      const firstBarOfYear = rawData.find(bar => new Date(bar.time).getFullYear() === currentYear);
      startPrice = firstBarOfYear ? firstBarOfYear.open : rawData[0].close;
    } else if (range === '1Y') startPrice = rawData[Math.max(0, rawData.length - 252)].close;
    else if (range === '3Y') startPrice = rawData[0].close * 0.72; // Simulating longer growth
    else if (range === '5Y') startPrice = rawData[0].close * 0.45;
    else if (range === '10Y') startPrice = rawData[0].close * 0.21;

    return parseFloat((((endPrice - startPrice) / startPrice) * 100).toFixed(2));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} className="animate-fade-in">
      
      {/* Ticker Selector & Search Bar */}
      <section style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap'
      }}>
        {/* Quick select buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['SPY', 'VOO', 'QQQ', 'SCHD', 'TQQQ'].map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTicker(t)}
              className="btn"
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                background: selectedTicker === t ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${selectedTicker === t ? 'rgba(59, 130, 246, 0.3)' : 'var(--glass-border)'}`,
                color: selectedTicker === t ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '300px' }}>
          <div style={{
            position: 'absolute',
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-secondary)'
          }}>
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Buscar por Ticker o Nombre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '2.5rem', width: '100%', height: '2.5rem' }}
          />

          {filteredTickers.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '2.75rem',
              left: 0,
              right: 0,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              zIndex: 30,
              maxHeight: '250px',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)'
            }}>
              {filteredTickers.map((t) => (
                <div
                  key={t.symbol}
                  onClick={() => {
                    setSelectedTicker(t.symbol);
                    setSearchQuery('');
                  }}
                  style={{
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.03)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <span style={{ fontWeight: 700 }}>{t.symbol}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>{t.name}</span>
                  </div>
                  <span className={`badge ${t.buyHoldIndex >= 75 ? 'badge-buy' : 'badge-hold'}`} style={{ fontSize: '0.7rem' }}>
                    {t.recommendation}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Top Indicators Cards & BuyHold Index */}
      <section style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1.5rem' }} className="grid-cols-2">
        {/* Core Indicators */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }} className="grid-cols-3">
          {/* Price Card */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Precio de Cierre</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.75rem', fontWeight: 800 }}>${activeStock.price.toFixed(2)}</span>
              <span style={{ 
                fontSize: '0.85rem', 
                fontWeight: 600, 
                color: activeStock.changePercent >= 0 ? 'var(--buy)' : 'var(--sell)',
                display: 'flex',
                alignItems: 'center'
              }}>
                {activeStock.changePercent >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {activeStock.changePercent}%
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{activeStock.name}</span>
          </div>

          {/* PE Card */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Valuación (PE Ratio)</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 800 }}>{activeStock.pe}x</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Promedio Sector: {(activeStock.pe * 0.9).toFixed(1)}x
            </span>
          </div>

          {/* Dividend Card */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Dividend Yield (Rendimiento)</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 800 }}>{activeStock.dy}%</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cap. Bursátil: {activeStock.cap}</span>
          </div>
        </div>

        {/* BuyHold Index Meter */}
        <div className="glass-card" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '1rem',
          border: `1px solid ${getBuyHoldColor(activeStock.buyHoldIndex)}22`,
          boxShadow: `0 8px 32px 0 ${getBuyHoldColor(activeStock.buyHoldIndex)}05`
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            BUYHOLD INDEX
          </span>
          
          <div className="gauge-container">
            <div className="gauge-body">
              <div className="gauge-center-mask">
                <span className="gauge-value" style={{ color: getBuyHoldColor(activeStock.buyHoldIndex) }}>
                  {activeStock.buyHoldIndex}
                </span>
                <span style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: 700, 
                  color: getBuyHoldColor(activeStock.buyHoldIndex),
                  textTransform: 'uppercase',
                  marginTop: '2px'
                }}>
                  {activeStock.recommendation}
                </span>
              </div>
              <div 
                className="gauge-needle" 
                style={{ transform: `rotate(${((activeStock.buyHoldIndex / 100) * 180) - 90}deg)` }} 
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Yahoo Finance Chart Box */}
      <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Timeframe selector */}
          <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', padding: '0.25rem', borderRadius: '8px' }}>
            {['1W', '1M', '6M', 'YTD', '1Y', '3Y', '5Y', '10Y'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className="btn"
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  borderRadius: '6px',
                  background: timeRange === range ? 'var(--bg-primary)' : 'transparent',
                  border: 'none',
                  color: timeRange === range ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                {range}
              </button>
            ))}
          </div>

          {/* Toggle candle/line */}
          <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', padding: '0.25rem', borderRadius: '8px' }}>
            <button
              onClick={() => setChartType('area')}
              className="btn"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                borderRadius: '6px',
                background: chartType === 'area' ? 'var(--bg-primary)' : 'transparent',
                border: 'none',
                color: chartType === 'area' ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}
            >
              Línea
            </button>
            <button
              onClick={() => setChartType('candle')}
              className="btn"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                borderRadius: '6px',
                background: chartType === 'candle' ? 'var(--bg-primary)' : 'transparent',
                border: 'none',
                color: chartType === 'candle' ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}
            >
              Velas
            </button>
          </div>
        </div>

        {/* Lightweight Charts Canvas */}
        <div ref={chartContainerRef} style={{ width: '100%', position: 'relative' }} />
        {['3Y', '5Y', '10Y'].includes(timeRange) && (
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.01)',
            padding: '0.5rem',
            borderRadius: '6px',
            border: '1px dashed var(--glass-border)'
          }}>
            Nota: Este prototipo utiliza 2 años de datos dummy escalados para representar el horizonte de {timeRange}.
          </div>
        )}
      </section>

      {/* Ticker performance indicators matrix */}
      <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Rendimiento Histórico Comparado</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.75rem' }} className="grid-cols-4">
          {[
            { label: 'Diario', code: 'D' },
            { label: 'Semanal', code: 'W' },
            { label: 'Mensual', code: 'M' },
            { label: 'YTD', code: 'YTD' },
            { label: '1 Año', code: '1Y' },
            { label: '3 Años', code: '3Y' },
            { label: '5 Años', code: '5Y' },
            { label: '10 Años', code: '10Y' }
          ].map((item) => {
            const ret = getSimulatedReturn(item.code);
            const isPos = ret >= 0;
            return (
              <div key={item.label} style={{
                background: 'var(--bg-tertiary)',
                padding: '0.75rem',
                borderRadius: '10px',
                textAlign: 'center',
                border: '1px solid var(--glass-border)'
              }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                <p style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: isPos ? 'var(--buy)' : 'var(--sell)',
                  marginTop: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px'
                }}>
                  {isPos ? '+' : ''}{ret}%
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Yearly Value & Simulator Table */}
      <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Desglose de Desempeño y Simulación por Año</h3>
        
        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Año</th>
                <th>Valor Inicial</th>
                <th>Valor Final</th>
                <th>Mínimo (Low)</th>
                <th>Máximo (High)</th>
                <th>Rendimiento</th>
                <th style={{ background: 'rgba(59, 130, 246, 0.03)' }}>Invirtiendo $1000 al Inicio</th>
                <th style={{ background: 'rgba(16, 185, 129, 0.03)' }}>Invirtiendo $1000 en el Low</th>
              </tr>
            </thead>
            <tbody>
              {yearlyData.map((y) => (
                <tr key={y.year}>
                  <td style={{ fontWeight: 700 }}>{y.year}</td>
                  <td>${y.initialValue}</td>
                  <td>${y.finalValue}</td>
                  <td style={{ color: 'var(--sell)' }}>${y.lowValue}</td>
                  <td style={{ color: 'var(--buy)' }}>${y.highValue}</td>
                  <td style={{ 
                    fontWeight: 700, 
                    color: y.changePercent >= 0 ? 'var(--buy)' : 'var(--sell)' 
                  }}>
                    {y.changePercent >= 0 ? '+' : ''}{y.changePercent}%
                  </td>
                  {/* Invested at start */}
                  <td style={{ background: 'rgba(59, 130, 246, 0.01)' }}>
                    <span style={{ fontWeight: 700 }}>${y.invStartCurrentValue}</span>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      marginLeft: '0.5rem',
                      color: y.invStartChangePercent >= 0 ? 'var(--buy)' : 'var(--sell)'
                    }}>
                      ({y.invStartChangePercent >= 0 ? '+' : ''}{y.invStartChangePercent.toFixed(1)}%)
                    </span>
                  </td>
                  {/* Invested at low */}
                  <td style={{ background: 'rgba(16, 185, 129, 0.01)' }}>
                    <span style={{ fontWeight: 700 }}>${y.invLowCurrentValue}</span>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      marginLeft: '0.5rem',
                      color: y.invLowChangePercent >= 0 ? 'var(--buy)' : 'var(--sell)'
                    }}>
                      ({y.invLowChangePercent >= 0 ? '+' : ''}{y.invLowChangePercent.toFixed(1)}%)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
};
