'use client';

import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { X, Mail, Lock, LogIn, UserPlus, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const locale = useLocale();
  const { signInWithGoogle, signInWithMicrosoft, signInWithEmail, signUpWithEmail } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      onClose();
    } catch (err: any) {
      console.error('Email Auth Error:', err);
      let msg = err.message || 'Error en la autenticación';
      if (msg.includes('user-not-found') || msg.includes('invalid-credential')) {
        msg = locale === 'es' ? 'Correo o contraseña incorrectos' : 'Invalid email or password';
      } else if (msg.includes('email-already-in-use')) {
        msg = locale === 'es' ? 'Este correo ya está registrado' : 'Email is already in use';
      } else if (msg.includes('weak-password')) {
        msg = locale === 'es' ? 'La contraseña debe tener al menos 6 caracteres' : 'Password must be at least 6 characters';
      }
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuth = async (providerFn: () => Promise<void>) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await providerFn();
      onClose();
    } catch (err: any) {
      console.error('OAuth Error:', err);
      if (!err.message?.includes('popup-closed-by-user')) {
        setError(err.message || 'Error iniciando sesión con el proveedor');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md p-6 rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl text-slate-100 flex flex-col gap-5">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col gap-1 text-center">
          <h2 className="text-xl font-extrabold text-white tracking-wide">
            {mode === 'login' 
              ? (locale === 'es' ? 'Iniciar Sesión en BuyHoldTime' : 'Sign In to BuyHoldTime')
              : (locale === 'es' ? 'Crear Cuenta en BuyHoldTime' : 'Create Account in BuyHoldTime')}
          </h2>
          <p className="text-xs text-slate-400">
            {locale === 'es'
              ? 'Accede a tus stocks, modelos de valoración y configuraciones'
              : 'Access your stocks, valuation models, and settings'}
          </p>
        </div>

        {/* OAuth Buttons */}
        <div className="flex flex-col gap-2.5">
          {/* Google Button */}
          <button
            type="button"
            onClick={() => handleOAuth(signInWithGoogle)}
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-3 transition cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>{locale === 'es' ? 'Continuar con Google' : 'Continue with Google'}</span>
          </button>

          {/* Microsoft Button */}
          <button
            type="button"
            onClick={() => handleOAuth(signInWithMicrosoft)}
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-3 transition cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 23 23">
              <path fill="#f35325" d="M1 1h10v10H1z" />
              <path fill="#81bc06" d="M12 1h10v10H12z" />
              <path fill="#05a6f0" d="M1 12h10v10H1z" />
              <path fill="#ffba08" d="M12 12h10v10H12z" />
            </svg>
            <span>{locale === 'es' ? 'Continuar con Microsoft' : 'Continue with Microsoft'}</span>
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
          <div className="flex-1 h-px bg-slate-800"></div>
          <span>{locale === 'es' ? 'o con correo' : 'or with email'}</span>
          <div className="flex-1 h-px bg-slate-800"></div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Email Form */}
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1 text-left">
            <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Mail size={12} className="text-teal-400" />
              {locale === 'es' ? 'Correo Electrónico' : 'Email Address'}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-teal-400 transition"
            />
          </div>

          <div className="flex flex-col gap-1 text-left">
            <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Lock size={12} className="text-teal-400" />
              {locale === 'es' ? 'Contraseña' : 'Password'}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-teal-400 transition"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs transition cursor-pointer flex items-center justify-center gap-2 mt-1 disabled:opacity-50 shadow-md"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin text-slate-950" />
            ) : mode === 'login' ? (
              <>
                <LogIn size={14} />
                <span>{locale === 'es' ? 'Iniciar Sesión' : 'Sign In'}</span>
              </>
            ) : (
              <>
                <UserPlus size={14} />
                <span>{locale === 'es' ? 'Registrarse' : 'Sign Up'}</span>
              </>
            )}
          </button>
        </form>

        {/* Mode Switcher Footer */}
        <div className="pt-3 border-t border-slate-800/80 text-center text-xs text-slate-400">
          {mode === 'login' ? (
            <p>
              {locale === 'es' ? '¿No tienes una cuenta?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className="font-bold text-teal-400 hover:underline cursor-pointer ml-1"
              >
                {locale === 'es' ? 'Regístrate aquí' : 'Sign up here'}
              </button>
            </p>
          ) : (
            <p>
              {locale === 'es' ? '¿Ya tienes una cuenta?' : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="font-bold text-teal-400 hover:underline cursor-pointer ml-1"
              >
                {locale === 'es' ? 'Inicia sesión' : 'Sign in'}
              </button>
            </p>
          )}
        </div>

      </div>
    </div>
  );
};
