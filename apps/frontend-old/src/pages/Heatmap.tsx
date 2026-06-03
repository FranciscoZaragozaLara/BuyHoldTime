import React, { useState } from 'react';
import { ALL_TICKERS, type TickerInfo } from '../data/historicalData';
import { LayoutGrid, Eye } from 'lucide-react';

export const Heatmap: React.FC = () => {
  const [hoveredStock, setHoveredStock] = useState<TickerInfo | null>(null);

  // Group tickers by sector
  const sectors: { [key: string]: TickerInfo[] } = {};
  ALL_TICKERS.forEach(stock => {
    // Skip general indices for cleaner industry representation
    if (stock.sector === 'Index') return;
    
    if (!sectors[stock.sector]) {
      sectors[stock.sector] = [];
    }
    sectors[stock.sector].push(stock);
  });

  // Calculate heatmap color based on performance
  const getHeatmapColor = (changePercent: number) => {
    if (changePercent > 3) return '#047857'; // Dark Emerald
    if (changePercent > 1.5) return '#059669'; // Emerald
    if (changePercent > 0.3) return '#10b981'; // Green
    if (changePercent >= -0.3) return '#475569'; // Grey Slate
    if (changePercent >= -1.5) return '#f43f5e'; // Light Rose
    if (changePercent >= -3) return '#e11d48'; // Rose
    return '#be123c'; // Dark Rose
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} className="animate-fade-in">
      
      {/* Intro */}
      <section className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          padding: '1rem',
          borderRadius: '12px',
          color: 'var(--strong-buy)'
        }}>
          <LayoutGrid size={32} />
        </div>
        <div style={{ flex: 1, minWidth: '280px' }}>
          <h2 style={{ fontSize: '1.6rem' }}>Mapa de Calor del Mercado (Heatmap)</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>
            Visualiza el estado de ánimo de los sectores más importantes del mercado de un vistazo rápido. El color refleja la variación porcentual de hoy.
          </p>
        </div>
      </section>

      {/* Main Heatmap Area */}
      <section style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1.5rem' }} className="grid-cols-2">
        {/* Heatmap Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {Object.keys(sectors).map((sectorName) => (
            <div key={sectorName} className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                {sectorName}
              </h3>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', 
                gap: '0.5rem' 
              }}>
                {sectors[sectorName].map((stock) => (
                  <div
                    key={stock.symbol}
                    onMouseEnter={() => setHoveredStock(stock)}
                    onMouseLeave={() => setHoveredStock(null)}
                    style={{
                      background: getHeatmapColor(stock.changePercent),
                      height: '70px',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      border: hoveredStock?.symbol === stock.symbol ? '2px solid white' : '1px solid rgba(0,0,0,0.15)',
                      transition: 'transform 0.1s ease, border 0.1s ease',
                      transform: hoveredStock?.symbol === stock.symbol ? 'scale(1.05)' : 'scale(1)',
                      boxShadow: hoveredStock?.symbol === stock.symbol ? '0 5px 15px rgba(0,0,0,0.5)' : 'none'
                    }}
                  >
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'white' }}>{stock.symbol}</span>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.9)', marginTop: '2px', fontWeight: 600 }}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Ticker Inspector Details (Sidebar) */}
        <div>
          <div className="glass-card" style={{ 
            position: 'sticky', 
            top: '6rem', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '1.25rem',
            minHeight: '300px',
            justifyContent: hoveredStock ? 'flex-start' : 'center'
          }}>
            {hoveredStock ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                    DETALLES DE TICKER
                  </span>
                  <h3 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>{hoveredStock.symbol}</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{hoveredStock.name}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Precio:</span>
                  <span style={{ fontWeight: 700 }}>${hoveredStock.price.toFixed(2)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cambio Diario:</span>
                  <span style={{ 
                    fontWeight: 700, 
                    color: hoveredStock.changePercent >= 0 ? 'var(--buy)' : 'var(--sell)' 
                  }}>
                    {hoveredStock.changePercent >= 0 ? '+' : ''}{hoveredStock.changePercent}%
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>BuyHold Index:</span>
                  <span style={{ 
                    fontWeight: 800, 
                    color: hoveredStock.buyHoldIndex >= 75 ? 'var(--strong-buy)' : 'var(--hold)' 
                  }}>
                    {hoveredStock.buyHoldIndex}/100
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Recomendación:</span>
                  <span className={`badge ${hoveredStock.buyHoldIndex >= 85 ? 'badge-strong-buy' : hoveredStock.buyHoldIndex >= 65 ? 'badge-buy' : 'badge-hold'}`}>
                    {hoveredStock.recommendation}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Valuación (PE):</span>
                  <span style={{ fontWeight: 600 }}>{hoveredStock.pe}x</span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <Eye size={36} style={{ color: 'var(--text-muted)' }} />
                <p style={{ fontSize: '0.9rem' }}>Pasa el cursor sobre un ticker para ver su análisis detallado.</p>
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  );
};
