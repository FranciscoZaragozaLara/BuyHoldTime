import { BacktestingClient } from './BacktestingClient';

async function getStrategies() {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const res = await fetch(`${base}/api/backtesting/strategies`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}
async function getRuns() {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const res = await fetch(`${base}/api/backtesting/runs`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

export default async function BacktestingPage() {
  const strategies = await getStrategies();
  const runs = await getRuns();

  // fallback mock si API no disponible (dev sin backend)
  const fallbackStrategies = [
    { code: 'MALLIK_TQQQ', name: 'Mallik TQQQ (QQQ signal)', version: '1.0' },
    { code: 'BH_QQQ', name: 'Buy & Hold QQQ', version: '1.0' },
    { code: 'BH_TQQQ', name: 'Buy & Hold TQQQ', version: '1.0' },
  ];

  return <BacktestingClient initialStrategies={strategies || fallbackStrategies} initialRuns={runs} />;
}
