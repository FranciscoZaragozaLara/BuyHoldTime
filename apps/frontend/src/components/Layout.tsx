'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { TrendingUp, BarChart3, Compass, Briefcase, LayoutGrid, Menu, X, Mail, Globe, LogIn } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { UserMenu } from '@/components/UserMenu';
import { AuthModal } from '@/components/AuthModal';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const t = useTranslations('Navigation');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { user, role } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const navItems = [
    { name: t('home'), path: `/${locale}`, icon: <Compass size={18} /> },
    { name: t('prices'), path: `/${locale}/prices`, icon: <TrendingUp size={18} /> },
    { name: t('indicators'), path: `/${locale}/indicators`, icon: <BarChart3 size={18} /> },
    { name: t('backtester'), path: `/${locale}/backtester`, icon: <Briefcase size={18} /> },
    { name: t('heatmap'), path: `/${locale}/heatmap`, icon: <LayoutGrid size={18} /> },
    ...(role === 'ADMIN' ? [{ name: 'Admin', path: `/${locale}/admin`, icon: <Briefcase size={18} /> }] : []),
  ];


  // Extracts current page path without locale, and switches the locale prefix
  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;
    const parts = pathname.split('/');
    parts[1] = newLocale; // replace locale segment
    router.push(parts.join('/'));
  };

  const currentPathWithoutLocale = pathname.replace(`/${locale}`, '') || '/';

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Auth Modal Component */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* Premium Navbar */}
      <header className="sticky top-0 z-50 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md transition-all duration-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          
          {/* Logo */}
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <TrendingUp size={28} className="text-teal-500" />
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              BuyHold<span className="text-teal-500">Time</span>.com
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              // Exact or start-with matching for active state
              const isHome = item.path === `/${locale}`;
              const isActive = isHome 
                ? pathname === `/${locale}`
                : pathname.startsWith(item.path);

              return (
                <Link
                  key={item.name}
                  href={item.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                    isActive
                      ? 'bg-teal-500/10 text-teal-400 border-teal-500/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/50 border-transparent'
                  }`}
                >
                  {item.icon}
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Right Header Actions */}
          <div className="hidden md:flex items-center gap-3">
            {/* Language Selector */}
            <div className="flex items-center gap-1 text-slate-400 border border-slate-800 rounded-lg px-2 py-1.5 bg-slate-900/30 text-xs">
              <Globe size={13} className="text-slate-500" />
              <button 
                onClick={() => switchLocale('en')}
                className={`hover:text-slate-100 font-semibold px-1 py-0.5 rounded transition ${locale === 'en' ? 'text-teal-400 bg-slate-800' : ''}`}
              >
                EN
              </button>
              <span className="text-slate-800">|</span>
              <button 
                onClick={() => switchLocale('es')}
                className={`hover:text-slate-100 font-semibold px-1 py-0.5 rounded transition ${locale === 'es' ? 'text-teal-400 bg-slate-800' : ''}`}
              >
                ES
              </button>
            </div>

            {/* Auth Button or User Menu */}
            {user ? (
              <UserMenu />
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 text-xs font-extrabold transition cursor-pointer"
              >
                <LogIn size={14} />
                <span>{locale === 'es' ? 'Iniciar Sesión' : 'Sign In'}</span>
              </button>
            )}

            {/* Subscribe Action */}
            <a 
              href="#subscribe" 
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-teal-400 hover:bg-teal-300 transition-colors shadow-lg shadow-teal-500/10"
            >
              <Mail size={14} />
              {t('ctaSubscribe')}
            </a>
          </div>

          {/* Mobile Actions Container */}
          <div className="flex items-center gap-2 md:hidden">
            {/* Mobile Lang Selector */}
            <div className="flex items-center gap-1 text-slate-400 border border-slate-800 rounded-lg px-2 py-1 bg-slate-900/30 text-xs">
              <button 
                onClick={() => switchLocale('en')}
                className={`hover:text-slate-100 px-1 py-0.5 rounded ${locale === 'en' ? 'text-teal-400 bg-slate-800 font-bold' : ''}`}
              >
                EN
              </button>
              <button 
                onClick={() => switchLocale('es')}
                className={`hover:text-slate-100 px-1 py-0.5 rounded ${locale === 'es' ? 'text-teal-400 bg-slate-800 font-bold' : ''}`}
              >
                ES
              </button>
            </div>

            {/* Hamburger Button */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 bg-slate-900/50"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

        </div>
      </header>

      {/* Mobile Sidebar / Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xs bg-slate-950 border-l border-slate-900 shadow-2xl p-6 pt-24 flex flex-col gap-4 animate-in slide-in-from-right duration-250">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isHome = item.path === `/${locale}`;
              const isActive = isHome 
                ? pathname === `/${locale}`
                : pathname.startsWith(item.path);

              return (
                <Link
                  key={item.name}
                  href={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all border ${
                    isActive
                      ? 'bg-teal-500/10 text-teal-400 border-teal-500/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/30 border-transparent'
                  }`}
                >
                  {item.icon}
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <a 
            href="#subscribe" 
            onClick={() => setMobileMenuOpen(false)} 
            className="flex items-center justify-center gap-2 p-3 mt-4 rounded-xl text-sm font-bold text-slate-950 bg-teal-400 hover:bg-teal-300 transition"
          >
            <Mail size={16} />
            {t('ctaSubscribe')}
          </a>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-grow">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/40 py-12 text-slate-500 text-xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <p className="font-bold text-slate-300 text-sm mb-1">BuyHoldTime.com</p>
            <p className="text-slate-500">Combining indicators and stock metrics to pinpoint investing windows.</p>
          </div>
          <div className="text-center md:text-right">
            <p>© {new Date().getFullYear()} BuyHoldTime.com. All rights reserved. Demo Version.</p>
            <p className="mt-1 text-slate-600">Built using Next.js & NestJS Clean Architecture.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
