import { Ticker } from '@/services/api';

interface Props {
  ticker: Ticker;
  locale: string;
}

/**
 * StockSeoSummary — Server Component
 *
 * Renders a crawlable, pre-rendered block of semantic content about the stock.
 * This is the most important SEO element: it makes the EPS, P/E, valuation data,
 * and analysis visible to Google and LLMs without needing JavaScript execution.
 *
 * Design principle: informative for bots, unobtrusive for users (collapsible
 * after the first paragraph, styled to blend with the page).
 */
export function StockSeoSummary({ ticker, locale }: Props) {
  const isEs = locale === 'es';
  const pe = ticker.pe ?? ticker.trailingPe;
  const fwdPe = ticker.forwardPe;
  const eps = ticker.eps;
  const score = ticker.buyHoldIndex;
  const rec = ticker.recommendation;
  const peg = ticker.pegRatio;
  const dyield = ticker.dy;
  const weekHigh = ticker.fiftyTwoWeekHigh;
  const weekLow = ticker.fiftyTwoWeekLow;

  const isBullish = score >= 75;
  const isBearish = score < 45;
  const sentiment = isBullish ? (isEs ? 'alcista' : 'bullish') : isBearish ? (isEs ? 'bajista' : 'bearish') : (isEs ? 'neutral' : 'neutral');

  // Build a natural-language summary paragraph for LLM indexing
  const summaryEn = `
    ${ticker.symbol} (${ticker.name}) is currently trading at $${ticker.price.toFixed(2)} 
    with a daily change of ${ticker.changePercent >= 0 ? '+' : ''}${ticker.changePercent.toFixed(2)}%.
    ${pe ? `The trailing P/E ratio is ${pe.toFixed(1)}x${fwdPe ? ` and the forward P/E is ${fwdPe.toFixed(1)}x` : ''}, ` : ''}
    ${eps ? `with a trailing twelve-month EPS (earnings per share) of $${eps.toFixed(2)}. ` : ''}
    ${peg ? `The PEG ratio of ${peg.toFixed(2)} ${peg < 1 ? 'suggests the stock may be undervalued relative to its growth rate' : 'reflects the current growth premium'}. ` : ''}
    ${dyield ? `${ticker.symbol} pays a dividend yield of ${dyield.toFixed(2)}%. ` : ''}
    ${weekHigh && weekLow ? `Over the past 52 weeks, the stock has traded between $${weekLow.toFixed(2)} and $${weekHigh.toFixed(2)}. ` : ''}
    BuyHoldTime's algorithmic Buy/Hold Index assigns ${ticker.symbol} a score of ${score} out of 100,
    indicating a ${sentiment} outlook with a recommendation of "${rec}".
    This score integrates macroeconomic signals, valuation multiples, and historical EPS growth trends.
  `.replace(/\s+/g, ' ').trim();

  const summaryEs = `
    ${ticker.symbol} (${ticker.name}) cotiza actualmente a $${ticker.price.toFixed(2)} 
    con un cambio diario de ${ticker.changePercent >= 0 ? '+' : ''}${ticker.changePercent.toFixed(2)}%.
    ${pe ? `El P/E ratio trailing es ${pe.toFixed(1)}x${fwdPe ? ` y el P/E forward es ${fwdPe.toFixed(1)}x` : ''}, ` : ''}
    ${eps ? `con un EPS (ganancias por acción) de los últimos 12 meses de $${eps.toFixed(2)}. ` : ''}
    ${dyield ? `${ticker.symbol} paga un rendimiento por dividendo del ${dyield.toFixed(2)}%. ` : ''}
    ${weekHigh && weekLow ? `En las últimas 52 semanas, la acción ha cotizado entre $${weekLow.toFixed(2)} y $${weekHigh.toFixed(2)}. ` : ''}
    El Índice Buy/Hold de BuyHoldTime asigna a ${ticker.symbol} una puntuación de ${score} sobre 100,
    indicando una perspectiva ${sentiment} con una recomendación de "${rec}".
  `.replace(/\s+/g, ' ').trim();

  const summary = isEs ? summaryEs : summaryEn;

  // FAQ data for rich results
  const faqs = isEs ? [
    {
      q: `¿Es buen momento para comprar ${ticker.symbol}?`,
      a: `Según el Índice Buy/Hold de BuyHoldTime, ${ticker.symbol} tiene una puntuación de ${score}/100 con una recomendación de "${rec}". ${isBullish ? 'Esto sugiere condiciones favorables para comprar a largo plazo.' : 'Se recomienda precaución antes de iniciar posiciones nuevas.'}`,
    },
    {
      q: `¿Cuál es el P/E ratio de ${ticker.symbol}?`,
      a: `${ticker.symbol} tiene un P/E ratio trailing de ${pe ? `${pe.toFixed(1)}x` : 'N/A'}${fwdPe ? ` y un P/E forward estimado de ${fwdPe.toFixed(1)}x` : ''}.`,
    },
    {
      q: `¿Cuánto gana por acción ${ticker.symbol}?`,
      a: `${ticker.symbol} reporta un EPS (ganancias por acción) de los últimos doce meses de ${eps ? `$${eps.toFixed(2)}` : 'N/A'}.`,
    },
  ] : [
    {
      q: `Is ${ticker.symbol} a good stock to buy right now?`,
      a: `According to BuyHoldTime's Buy/Hold Index, ${ticker.symbol} scores ${score}/100 with a "${rec}" recommendation. ${isBullish ? 'This indicates favorable conditions for long-term accumulation.' : 'Caution is advised before initiating new positions.'}`,
    },
    {
      q: `What is ${ticker.symbol}'s P/E ratio?`,
      a: `${ticker.symbol} has a trailing P/E ratio of ${pe ? `${pe.toFixed(1)}x` : 'N/A'}${fwdPe ? ` and an estimated forward P/E of ${fwdPe.toFixed(1)}x` : ''}.`,
    },
    {
      q: `What is ${ticker.symbol}'s EPS?`,
      a: `${ticker.symbol} reports a trailing twelve-month earnings per share (EPS TTM) of ${eps ? `$${eps.toFixed(2)}` : 'N/A'}.`,
    },
    {
      q: `What is the 52-week range for ${ticker.symbol}?`,
      a: `Over the past 52 weeks, ${ticker.symbol} has traded between ${weekLow ? `$${weekLow.toFixed(2)}` : 'N/A'} and ${weekHigh ? `$${weekHigh.toFixed(2)}` : 'N/A'}.`,
    },
  ];

  return (
    <section
      aria-label={isEs ? `Resumen de análisis de ${ticker.symbol}` : `${ticker.symbol} analysis summary`}
      className="rounded-2xl border border-slate-900 bg-slate-950/40 backdrop-blur-sm p-6 flex flex-col gap-5"
    >
      {/* ── Section Header ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-900 pb-4">
        <span className="w-1.5 h-5 rounded-full bg-teal-400" aria-hidden="true" />
        <h2 className="text-sm font-bold text-white">
          {isEs ? `Análisis Fundamental — ${ticker.symbol}` : `Fundamental Analysis — ${ticker.symbol}`}
        </h2>
        <span className="ml-auto text-[10px] text-slate-500 font-medium uppercase tracking-wider">
          {isEs ? 'Resumen del Índice BuyHold' : 'BuyHold Index Summary'}
        </span>
      </div>

      {/* ── Summary paragraph (indexed by Google/LLMs) ───────────────────── */}
      <p className="text-sm text-slate-300 leading-relaxed">
        {summary}
      </p>

      {/* ── Key metrics table (SSR — crawlable) ──────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: isEs ? 'Precio' : 'Price', value: `$${ticker.price.toFixed(2)}` },
          { label: isEs ? 'P/E Trailing' : 'Trailing P/E', value: pe ? `${pe.toFixed(1)}x` : 'N/A' },
          { label: isEs ? 'P/E Forward' : 'Forward P/E', value: fwdPe ? `${fwdPe.toFixed(1)}x` : 'N/A' },
          { label: 'EPS TTM', value: eps ? `$${eps.toFixed(2)}` : 'N/A' },
          { label: isEs ? 'Div. Yield' : 'Div. Yield', value: dyield ? `${dyield.toFixed(2)}%` : 'N/A' },
          { label: isEs ? 'Score BHT' : 'BHT Score', value: `${score}/100` },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-0.5 p-3 rounded-xl bg-slate-900/50 border border-slate-900">
            <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">{label}</span>
            <span className="text-sm font-bold text-white">{value}</span>
          </div>
        ))}
      </div>

      {/* ── FAQ accordion (SSR — crawlable, great for FAQPage schema) ─────── */}
      <div className="flex flex-col gap-2 mt-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {isEs ? 'Preguntas Frecuentes' : 'Frequently Asked Questions'}
        </h3>
        {faqs.map(({ q, a }) => (
          <details key={q} className="group rounded-xl border border-slate-900 bg-slate-900/30">
            <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-300 list-none flex justify-between items-center hover:text-white transition">
              {q}
              <span className="text-slate-600 group-open:rotate-180 transition-transform text-base leading-none">▾</span>
            </summary>
            <p className="px-4 pb-3 text-xs text-slate-400 leading-relaxed">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
