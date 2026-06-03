'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { createSubscription } from '@/services/api';

export const SubscribeForm: React.FC = () => {
  const t = useTranslations('LandingPage');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    setLoading(true);
    setError(null);
    try {
      await createSubscription(name, email);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred during subscription.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 text-emerald-400 p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 w-full max-w-lg transition duration-300">
        <CheckCircle2 size={44} className="stroke-[1.5]" />
        <h3 className="text-lg font-bold">{t('subscribeSuccess')}</h3>
        <p className="text-sm text-slate-400 text-center">
          Thanks for subscribing, <strong>{name}</strong>! You will now receive our weekly market insights and strong buy alerts.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg bg-slate-900/40 border border-slate-900 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="bg-teal-500/10 p-4 rounded-full text-teal-400">
          <Mail size={32} className="stroke-[1.5]" />
        </div>
        
        <div>
          <h2 className="text-2xl font-extrabold text-white">{t('subscribersTitle')}</h2>
          <p className="text-sm text-slate-400 mt-2 max-w-md">
            {t('subscribersSubtitle')}
          </p>
        </div>

        <form onSubmit={handleSubscribe} className="flex flex-col gap-4 w-full mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder={t('nameLabel')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
              className="px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors disabled:opacity-50 text-sm"
            />
            <input
              type="email"
              placeholder={t('emailLabel')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors disabled:opacity-50 text-sm"
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-rose-400 text-left px-1">
              ⚠️ {error}
            </p>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-bold text-slate-950 bg-teal-400 hover:bg-teal-300 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin text-slate-950" />
            ) : (
              <>
                {t('subscribeButton')}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
