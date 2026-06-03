import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Star, Mail, CheckCircle2, Sparkles } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { TOP_RECOMMENDED } from '../data/historicalData';

// Mini dummy data for index sparklines
const spySpark = [{ v: 480 }, { v: 485 }, { v: 490 }, { v: 488 }, { v: 495 }, { v: 505 }, { v: 512 }];
const nasdaqSpark = [{ v: 15500 }, { v: 15700 }, { v: 15600 }, { v: 15900 }, { v: 16100 }, { v: 16300 }, { v: 16420 }];
const fearSpark = [{ v: 45 }, { v: 50 }, { v: 52 }, { v: 58 }, { v: 65 }, { v: 60 }, { v: 62 }];
const schillerSpark = [{ v: 31.2 }, { v: 31.8 }, { v: 32.5 }, { v: 33.1 }, { v: 33.5 }, { v: 34.0 }, { v: 34.25 }];

export const LandingPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && name) {
      setSubscribed(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }} className="animate-fade-in">
      {/* Hero Section */}
      <section style={{
        padding: '3rem 0 1rem 0',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        maxWidth: '850px',
        margin: '0 auto'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 1rem',
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '50px',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: '#60a5fa'
        }}>
          <Sparkles size={14} />
          <span>La forma inteligente de cronometrar el mercado</span>
        </div>
        <h1 style={{
          fontSize: 'clamp(2.5rem, 5vw, 4.2rem)',
          lineHeight: 1.1,
          letterSpacing: '-0.04em',
          fontWeight: 800
        }}>
          Invierte con Sabiduría.<br />
          Compra en el <span className="gradient-text">Momento Exacto</span>.
        </h1>
        <p style={{
          fontSize: '1.2rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          maxWidth: '650px'
        }}>
          BuyHoldTime.com combina indicadores macroeconómicos clave, valuaciones históricas y nuestro algoritmo exclusivo <strong>BuyHold Index</strong> para decirte si es tiempo de comprar, mantener o esperar.
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <Link to="/prices" className="btn btn-primary" style={{ padding: '0.9rem 2rem', fontSize: '1rem' }}>
            Explorar Tickers
            <ArrowRight size={18} />
          </Link>
          <Link to="/indicators" className="btn btn-secondary" style={{ padding: '0.9rem 2rem', fontSize: '1rem' }}>
            Ver Indicadores
          </Link>
        </div>
      </section>

      {/* Main Indicators Dashboard */}
      <section>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          Indicadores Principales del Mercado
        </h2>
        <div className="grid-cols-4">
          {/* Card 1: S&P 500 */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>S&P 500 INDEX</span>
                <h3 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>5,124.00</h3>
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--buy)' }}>+0.52%</span>
            </div>
            <div style={{ height: '50px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spySpark}>
                  <defs>
                    <linearGradient id="spyGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#spyGlow)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actualizado en tiempo real (Simulado)</span>
          </div>

          {/* Card 2: NASDAQ */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>NASDAQ 100</span>
                <h3 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>16,420.50</h3>
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--buy)' }}>+0.85%</span>
            </div>
            <div style={{ height: '50px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={nasdaqSpark}>
                  <defs>
                    <linearGradient id="ndxGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#ndxGlow)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tendencia alcista a corto plazo</span>
          </div>

          {/* Card 3: Fear & Greed Index */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>FEAR & GREED INDEX</span>
                <h3 style={{ fontSize: '1.8rem', marginTop: '0.25rem', color: 'var(--hold)' }}>62 / 100</h3>
              </div>
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                padding: '0.2rem 0.5rem', 
                background: 'rgba(251, 191, 36, 0.15)', 
                color: 'var(--hold)',
                borderRadius: '4px',
                border: '1px solid rgba(251, 191, 36, 0.2)'
              }}>CODICIA</span>
            </div>
            <div style={{ height: '50px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fearSpark}>
                  <Area type="monotone" dataKey="v" stroke="#fbbf24" strokeWidth={2} fillOpacity={0.1} fill="#fbbf24" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>El mercado muestra optimismo moderado</span>
          </div>

          {/* Card 4: Schiller PE Ratio */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>SHILLER PE (CAPE)</span>
                <h3 style={{ fontSize: '1.8rem', marginTop: '0.25rem', color: 'var(--sell)' }}>34.25x</h3>
              </div>
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                padding: '0.2rem 0.5rem', 
                background: 'rgba(248, 113, 113, 0.15)', 
                color: 'var(--sell)',
                borderRadius: '4px',
                border: '1px solid rgba(248, 113, 113, 0.2)'
              }}>SOBREVALUADO</span>
            </div>
            <div style={{ height: '50px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={schillerSpark}>
                  <Area type="monotone" dataKey="v" stroke="#f87171" strokeWidth={2} fillOpacity={0.1} fill="#f87171" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Por encima de la media histórica de 17x</span>
          </div>
        </div>
      </section>

      {/* Top 5 Recommended Stocks */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.8rem' }}>Acciones Destacadas del Mes</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Nuestras 5 selecciones con mayor potencial según el BuyHold Index actual.
            </p>
          </div>
          <Link to="/prices" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            Ver 50 Tickers Recomendados
          </Link>
        </div>

        <div className="grid-cols-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {TOP_RECOMMENDED.map((stock) => {
            const isBuy = stock.buyHoldIndex >= 75;
            const badgeClass = stock.buyHoldIndex >= 85 ? 'badge-strong-buy' : 'badge-buy';
            
            return (
              <div key={stock.symbol} className="glass-card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {/* Glowing status line */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '4px',
                  height: '100%',
                  background: isBuy ? 'var(--strong-buy)' : 'var(--hold)'
                }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>{stock.symbol}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                      {stock.name}
                    </span>
                  </div>
                  <span className={`badge ${badgeClass}`}>{stock.recommendation}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Precio</span>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>${stock.price.toFixed(2)}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Cambio Diario</span>
                    <p style={{ 
                      fontSize: '1.1rem', 
                      fontWeight: 600, 
                      color: stock.changePercent >= 0 ? 'var(--buy)' : 'var(--sell)' 
                    }}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent}%
                    </p>
                  </div>
                </div>

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.03)'
                }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Star size={14} style={{ fill: '#fbbf24', color: '#fbbf24' }} />
                    BuyHold Index:
                  </span>
                  <span style={{ 
                    fontWeight: 800, 
                    fontSize: '1.1rem',
                    color: isBuy ? 'var(--strong-buy)' : 'var(--hold)'
                  }}>
                    {stock.buyHoldIndex}/100
                  </span>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PE Ratio: {stock.pe}x</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>•</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Div. Yield: {stock.dy}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Free Subscription Component */}
      <section id="subscribe" style={{
        maxWidth: '850px',
        margin: '0 auto',
        width: '100%'
      }}>
        <div className="glass-card" style={{
          padding: '3rem 2rem',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.5rem',
          background: 'linear-gradient(135deg, rgba(13, 18, 34, 0.8) 0%, rgba(59, 130, 246, 0.05) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.15)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            padding: '1rem',
            borderRadius: '50%',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Mail size={32} />
          </div>
          
          <div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Regístrate Gratis</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: '550px' }}>
              Obtén acceso a alertas instantáneas de "Strong Buy" en tu correo y nuestro boletín semanal de análisis macroeconómico.
            </p>
          </div>

          {!subscribed ? (
            <form onSubmit={handleSubscribe} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              width: '100%',
              maxWidth: '500px',
              marginTop: '0.5rem'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="grid-cols-2">
                <input
                  type="text"
                  placeholder="Tu Nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="form-input"
                  style={{ height: '3rem' }}
                />
                <input
                  type="email"
                  placeholder="Tu Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="form-input"
                  style={{ height: '3rem' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ height: '3rem', fontSize: '1rem' }}>
                Unirme a la comunidad
                <ArrowRight size={18} />
              </button>
            </form>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--strong-buy)',
              padding: '1.5rem',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.05)',
              border: '1px solid rgba(16, 185, 129, 0.1)',
              width: '100%',
              maxWidth: '500px'
            }}>
              <CheckCircle2 size={36} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>¡Registro Exitoso, {name}!</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                Hemos enviado un correo de bienvenida. Pronto recibirás nuestras alertas.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
