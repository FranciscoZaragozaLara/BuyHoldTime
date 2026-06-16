import 'dotenv/config';

async function test() {
  const symbol = 'VOO';
  const url = `http://localhost:4000/tickers/${symbol}?limit=8000`;
  console.log('Fetching details for VOO...');
  const res = await fetch(url);
  const details = await res.json() as any;
  
  const ticker = details.ticker;
  const historicalPrices = details.historicalPrices || [];
  const quarters = ticker.historicalEpsQuarterly || [];
  
  console.log('Ticker EPS:', ticker.eps);
  console.log('Ticker PE:', ticker.pe);
  console.log('Total quarters in DB:', quarters.length);
  console.log('Total prices in DB:', historicalPrices.length);

  // Helper to find closest price
  const findQuarterPrice = (qDateStr: string): number | null => {
    if (historicalPrices.length === 0) return null;
    const targetTime = new Date(qDateStr).getTime();
    
    let closestPrice = historicalPrices[0].close;
    let minDiff = Math.abs(new Date(historicalPrices[0].date).getTime() - targetTime);

    for (const p of historicalPrices) {
      const diff = Math.abs(new Date(p.date).getTime() - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestPrice = p.close;
      }
    }
    return closestPrice;
  };

  const baseQuarters = [...quarters];
  baseQuarters.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const today = new Date();
  const annualRate = 0.08;
  const currentEps = ticker.eps || 1.0;

  const withMetrics = baseQuarters.map((q: any) => {
    const quarterPrice = findQuarterPrice(q.date);
    if (!quarterPrice) return null;
    return {
      ...q,
      quarterPrice,
    };
  }).filter(Boolean) as any[];

  console.log('\nProcessed first 3 chronologically:');
  const fundQuartersWithMetrics = withMetrics.map((q, idx) => {
    const qDate = new Date(q.date + 'T12:00:00');
    const yearsDiff = (today.getTime() - qDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const estEps = currentEps / Math.pow(1 + annualRate, yearsDiff);
    
    const finalPe = (q.peRatio !== undefined && q.peRatio !== null && q.peRatio > 0) ? q.peRatio : (q.quarterPrice && estEps > 0 ? q.quarterPrice / estEps : 0);
    const finalEps = (q.peRatio && q.peRatio > 0 && q.quarterPrice) ? q.quarterPrice / q.peRatio : estEps;
    
    return {
      ...q,
      estEps: finalEps,
      peRatio: finalPe,
    };
  });

  const newest = fundQuartersWithMetrics.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  console.log('Newest 5 quarters with calculated metrics:');
  console.log(JSON.stringify(newest.slice(0, 5), null, 2));
}

test().catch(console.error);
