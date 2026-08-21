'use client';
import { useState, useMemo } from 'react';
import { getStrategyColor } from '@/lib/strategyColors';
interface Metrics { strategy: string; cagr: number; total_return: number; sharpe: number; max_drawdown: number; max_dd_length: number; num_trades: number; win_rate: number; sqn: number; final_value: number; }
type SortKey = keyof Pick<Metrics, 'strategy' | 'cagr' | 'total_return' | 'sharpe' | 'max_drawdown' | 'num_trades' | 'win_rate' | 'final_value'>;
export function MetricsTable({ data }: { data: Metrics[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('cagr');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const best = (key: keyof Metrics, higherIsBetter: boolean) => {
    const vals = data.map(d => d[key] as number);
    return higherIsBetter ? Math.max(...vals) : Math.min(...vals);
  };
  const fmtPct = (v: number) => `${(v*100).toFixed(2)}%`;
  const fmtMoney = (v: number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a,b)=>{
      const av = a[sortKey] as any; const bv = b[sortKey] as any;
      if (typeof av === 'string' && typeof bv === 'string') {
        const cmp = av.localeCompare(bv);
        return sortDir==='asc'? cmp : -cmp;
      }
      const diff = (av as number) - (bv as number);
      return sortDir==='asc'? diff : -diff;
    });
    return copy;
  }, [data, sortKey, sortDir]);
  const toggle = (k: SortKey) => {
    if (sortKey===k) setSortDir(d=> d==='asc'?'desc':'asc');
    else { setSortKey(k); setSortDir(k==='strategy'?'asc':'desc'); }
  };
  const Arrow = ({active, dir}:{active:boolean, dir:'asc'|'desc'}) => (
    <span className={`ml-1 text-[10px] ${active?'text-teal-400':'text-slate-600'}`}>{active ? (dir==='asc'?'▲':'▼') : '↕'}</span>
  );
  const thClass = 'p-2 font-medium cursor-pointer select-none hover:text-slate-200 transition-colors';
  return (
    <div className="overflow-auto bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h3 className="font-semibold mb-3 text-slate-100">Comparativa Métricas</h3>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-800 text-slate-400">
          <th className={`${thClass} text-left`} onClick={()=>toggle('strategy')}>Estrategia<Arrow active={sortKey==='strategy'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('cagr')}>CAGR<Arrow active={sortKey==='cagr'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('total_return')}>TotRet<Arrow active={sortKey==='total_return'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('sharpe')}>Sharpe<Arrow active={sortKey==='sharpe'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('max_drawdown')}>MaxDD<Arrow active={sortKey==='max_drawdown'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('num_trades')}>Trades<Arrow active={sortKey==='num_trades'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('win_rate')}>Win%<Arrow active={sortKey==='win_rate'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('final_value')}>Final<Arrow active={sortKey==='final_value'} dir={sortDir}/></th>
        </tr></thead>
        <tbody>
          {sorted.map((row, idx) => {
            const col = getStrategyColor(row.strategy);
            return (
            <tr key={`${row.strategy}-${idx}`} className="border-b border-slate-800/50 hover:bg-slate-800/40">
              <td className="p-2 font-medium text-slate-100"><span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10" style={{background: col}}/><span>{row.strategy}</span></span></td>
              <td className={`p-2 text-right text-slate-200 ${row.cagr===best('cagr',true)?'bg-teal-500/20 text-teal-400 font-semibold rounded':''}`}>{fmtPct(row.cagr)}</td>
              <td className="p-2 text-right text-slate-300">{fmtPct(row.total_return)}</td>
              <td className={`p-2 text-right text-slate-200 ${row.sharpe===best('sharpe',true)?'bg-teal-500/20 text-teal-400 font-semibold rounded':''}`}>{row.sharpe.toFixed(2)}</td>
              <td className={`p-2 text-right text-slate-200 ${row.max_drawdown===best('max_drawdown',false)?'bg-teal-500/20 text-teal-400 font-semibold rounded':''}`}>{fmtPct(row.max_drawdown)}</td>
              <td className="p-2 text-right text-slate-300">{row.num_trades}</td>
              <td className="p-2 text-right text-slate-300">{fmtPct(row.win_rate)}</td>
              <td className="p-2 text-right font-mono text-slate-100">{fmtMoney(row.final_value)}</td>
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  );
}
