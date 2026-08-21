import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });
async function main() {
  const qqq = JSON.parse(fs.readFileSync('/tmp/qqq.json','utf8'));
  const tqqq = JSON.parse(fs.readFileSync('/tmp/tqqq.json','utf8'));
  const rows = [
    ...qqq.map((r:any)=>({ ticker:'QQQ', date: r.Date || r.date, open: r.Open, high: r.High, low: r.Low, close: r.Close, adjClose: r.Close, volume: BigInt(r.Volume) })),
    ...tqqq.map((r:any)=>({ ticker:'TQQQ', date: r.Date || r.date, open: r.Open, high: r.High, low: r.Low, close: r.Close, adjClose: r.Close, volume: BigInt(r.Volume) })),
  ];
  console.log(`bulk upsert ${rows.length} rows...`);
  let done=0;
  for (const r of rows) {
    await prisma.btMarketData.upsert({
      where: { ticker_date: { ticker: r.ticker, date: new Date(r.date) } },
      update: { open: r.open, high: r.high, low: r.low, close: r.close, adjClose: r.adjClose, volume: r.volume, isValidated: true },
      create: { ticker: r.ticker, date: new Date(r.date), open: r.open, high: r.high, low: r.low, close: r.close, adjClose: r.adjClose, volume: r.volume, isValidated: true, source:'yfinance' },
    });
    done++;
    if (done%500===0) console.log(done);
  }
  console.log('done', done);
  console.log('count', await prisma.btMarketData.count());
}
main().catch(e=>{console.error(e); process.exit(1)}).finally(()=>prisma.$disconnect());
