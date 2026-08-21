'use client';
interface Strategy { code: string; name: string; version: string; }
export function StrategySelector({ strategies, selected, onChange }: { strategies: Strategy[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (code: string) => {
    if (selected.includes(code)) onChange(selected.filter(c => c !== code));
    else onChange([...selected, code]);
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h3 className="font-semibold mb-2 text-slate-100">Estrategias</h3>
      <div className="flex flex-wrap gap-2">
        {strategies.map(s => (
          <label key={s.code} className={`px-3 py-1.5 rounded-full border cursor-pointer text-sm transition-colors ${selected.includes(s.code) ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'}`}>
            <input type="checkbox" className="hidden" checked={selected.includes(s.code)} onChange={() => toggle(s.code)} />
            {s.code} <span className="opacity-70 text-xs">v{s.version}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
