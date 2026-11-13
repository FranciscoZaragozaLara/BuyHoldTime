'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { termsPath } from '@/lib/legal';

type Variant = 'signal' | 'backtest' | 'short';

/**
 * Aviso legal junto a señales (BHT Index, termómetro, Buy/Hold) y resultados de backtests.
 * Textos en messages/*.json → Legal; enlaza a la página de Términos y Aviso Legal.
 */
export function RiskDisclaimer({ variant = 'signal', className = '' }: { variant?: Variant; className?: string }) {
  const t = useTranslations('Legal');
  const locale = useLocale();
  return (
    <p
      role="note"
      className={`flex items-start gap-1.5 text-[10.5px] leading-relaxed text-slate-500 ${className}`}
    >
      <ShieldAlert size={12} className="mt-[2px] shrink-0 text-slate-600" aria-hidden />
      <span>
        {t(variant)}{' '}
        <Link href={termsPath(locale)} className="underline decoration-slate-700 underline-offset-2 hover:text-accent-400">
          {t('readTerms')}
        </Link>
        .
      </span>
    </p>
  );
}
