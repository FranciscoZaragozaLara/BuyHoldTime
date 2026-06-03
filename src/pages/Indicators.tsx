import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { INDICATORS } from '../data/indicatorsData';
import { TrendingUp, Info } from 'lucide-react';

export const Indicators: React.FC = () => {
  const [selectedId, setSelectedId] = useState('fear_greed');

  const activeIndicator = INDICATORS.find(ind => ind.id === selectedId) || INDICATORS[0];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Bullish':
      case 'Extreme Greed':
      case 'Greed':
      case 'Low':
        return 'var(--strong-buy)';
      case 'Neutral':
      case 'Normal':
        return 'var(--hold)';
      case 'Bearish':
      case 'Extreme Fear':
      case 'Fear':
      case 'High':
      default:
        return 'var(--strong-sell)';
    }
  };

  // Compute needle rotation for speedometer (values 0-100 or specific mapping)
  const getNeedleRotation = (ind: typeof activeIndicator) => {
    let percentage = 50;
    if (ind.id === 'fear_greed') {
      percentage = ind.currentValue;
    } else if (ind.id === 'schiller_pe') {
      // Shiller PE range 5 to 50
      percentage = ((ind.currentValue - 5) / 45) * 100;
    } else if (ind.id === 'pe_ratio') {
      // PE range 5 to 40
      percentage = ((ind.currentValue - 5) / 35) * 100;
    } else if (ind.id === 'vix') {
      // VIX range 5 to 50
      percentage = ((ind.currentValue - 5) / 45) * 100;
    } else if (ind.id === 'fed_rate' || ind.id === 'inflation' || ind.id === 'core_inflation' || ind.id === 'treasury_30y') {
      // Interest/Inflation range 0 to 10
      percentage = (ind.currentValue / 10) * 100;
    }
    percentage = Math.max(0, Math.min(100, percentage));
    return (percentage / 100) * 180 - 90;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} className="animate-fade-in">
      
      {/* Overview Intro */}
      <section className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{
          background: 'rgba(59, 130, 246, 0.1)',
          padding: '1rem',
          borderRadius: '12px',
          color: 'var(--accent-primary)'
        }}>
          <TrendingUp size={32} />
        </div>
        <div style={{ flex: 1, minWidth: '280px' }}>
          <h2 style={{ fontSize: '1.6rem' }}>Centro de Indicadores Macroeconómicos</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>
            Los mercados no se mueven en el vacío. Analiza las fuerzas de valoración, sentimiento y política monetaria que determinan la dirección del capital global.
          </p>
        </div>
      </section>

      {/* Main Grid: Selector & Details */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }} className="grid-cols-2">
        
        {/* Indicators List Menu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {INDICATORS.map((ind) => {
            const isSelected = ind.id === selectedId;
            return (
              <div
                key={ind.id}
                onClick={() => setSelectedId(ind.id)}
                className="glass-card"
                style={{
                  padding: '1rem 1.25rem',
                  cursor: 'pointer',
                  border: isSelected ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--glass-border)',
                  background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--glass-bg)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'var(--transition-fast)'
                }}
              >
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {ind.name}
                  </h4>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: getStatusColor(ind.status),
                    fontWeight: 700,
                    marginTop: '2px',
                    display: 'inline-block'
                  }}>
                    {ind.status}
                  </span>
                </div>
                <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                  {ind.currentValue}{ind.unit}
                </span>
              </div>
            );
          })}
        </div>

        {/* Selected Indicator Active Detail Panel */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Title & Status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                INDICADOR ACTIVO
              </span>
              <h3 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>{activeIndicator.name}</h3>
            </div>
            
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>VALOR ACTUAL</span>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: getStatusColor(activeIndicator.status) }}>
                {activeIndicator.currentValue}{activeIndicator.unit}
              </p>
            </div>
          </div>

          {/* Description Block */}
          <div style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--glass-border)',
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start'
          }}>
            <Info size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {activeIndicator.description}
            </p>
          </div>

          {/* Speedometer Gauge & Historical mini-plot */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', alignItems: 'center' }} className="grid-cols-2">
            {/* Speedometer */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>
                Semáforo de Estrategia
              </span>
              <div className="gauge-container">
                <div className="gauge-body">
                  <div className="gauge-center-mask">
                    <span className="gauge-value" style={{ color: getStatusColor(activeIndicator.status), fontSize: '1.5rem' }}>
                      {activeIndicator.status}
                    </span>
                  </div>
                  <div 
                    className="gauge-needle" 
                    style={{ transform: `rotate(${getNeedleRotation(activeIndicator)}deg)` }} 
                  />
                </div>
              </div>
            </div>

            {/* Historical chart using Recharts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Evolución Reciente (Historial)
              </span>
              <div style={{ height: '160px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activeIndicator.history} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="indicatorGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getStatusColor(activeIndicator.status)} stopOpacity={0.25}/>
                        <stop offset="95%" stopColor={getStatusColor(activeIndicator.status)} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{ background: 'var(--bg-tertiary)', borderColor: 'var(--glass-border)', borderRadius: '8px' }}
                      labelStyle={{ color: 'var(--text-secondary)' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke={getStatusColor(activeIndicator.status)} 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#indicatorGlow)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </div>
      </section>

    </div>
  );
};
