import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, BarChart3, Compass, Briefcase, LayoutGrid, Menu, X, Mail } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { name: 'Home', path: '/', icon: <Compass size={18} /> },
    { name: 'Precios & Tickers', path: '/prices', icon: <TrendingUp size={18} /> },
    { name: 'Indicadores', path: '/indicators', icon: <BarChart3 size={18} /> },
    { name: 'Backtester', path: '/backtester', icon: <Briefcase size={18} /> },
    { name: 'Heatmap', path: '/heatmap', icon: <LayoutGrid size={18} /> },
  ];

  return (
    <div className="app-container">
      {/* Premium Navbar */}
      <header style={{
        borderBottom: '1px solid var(--glass-border)',
        background: 'rgba(7, 10, 19, 0.8)',
        backdropFilter: 'var(--backdrop-blur)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        transition: 'var(--transition-smooth)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 1.5rem',
          height: '4.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Logo */}
          <Link to="/" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            color: 'inherit'
          }}>
            <TrendingUp size={28} style={{ color: '#3b82f6' }} />
            <span style={{
              fontSize: '1.4rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, #fff 40%, #94a3b8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              BuyHold<span style={{ color: '#3b82f6', WebkitTextFillColor: '#3b82f6' }}>Time</span>.com
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="desktop-only">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    textDecoration: 'none',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    border: isActive ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid transparent',
                    transition: 'var(--transition-smooth)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = 'var(--text-primary)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  {item.icon}
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Subscribe CTA Button */}
          <a href="#subscribe" className="desktop-only btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
            <Mail size={16} />
            Suscripción Gratis
          </a>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'none'
            }}
            className="mobile-only-btn"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Nav */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed',
          top: '4.5rem',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--bg-primary)',
          zIndex: 40,
          padding: '2rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          borderTop: '1px solid var(--glass-border)'
        }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                  border: isActive ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid var(--glass-border)',
                }}
              >
                {item.icon}
                {item.name}
              </Link>
            );
          })}
          <a 
            href="#subscribe" 
            onClick={() => setMobileMenuOpen(false)} 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '1rem' }}
          >
            <Mail size={18} />
            Suscripción Gratis
          </a>
        </div>
      )}

      {/* Main Content Area */}
      <main className="main-content">
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--glass-border)',
        padding: '2.5rem 1.5rem',
        marginTop: 'auto',
        background: 'rgba(7, 10, 19, 0.95)',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1.5rem'
        }}>
          <div>
            <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>BuyHoldTime.com</p>
            <p>El momento ideal para invertir con convicción y paciencia.</p>
          </div>
          <p>© 2026 BuyHoldTime.com. Prototipo Visual. Todos los derechos reservados.</p>
        </div>
      </footer>

      {/* CSS overrides for desktop/mobile display */}
      <style>{`
        @media (min-width: 769px) {
          .mobile-only-btn { display: none !important; }
        }
        @media (max-width: 768px) {
          .desktop-only { display: none !important; }
          .mobile-only-btn { display: block !important; }
        }
      `}</style>
    </div>
  );
};
