import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });

const startDates = [
  // c) base
  { startDate: '1993-01-29', label: '1993-01-29', descriptor: 'Origen SPY (SPY inception)', category: 'ORIGIN', source: 'SPY' },
  { startDate: '2010-02-11', label: '2010-02-11', descriptor: 'Origen TQQQ / QQQ (actual V8)', category: 'ORIGIN', source: 'TQQQ' },
  { startDate: '2011-10-20', label: '2011-10-20', descriptor: 'Origen SCHD (SCHD inception)', category: 'ORIGIN', source: 'SCHD' },
  { startDate: '2022-05-03', label: '2022-05-03', descriptor: 'Origen JEPQ (JEPQ inception)', category: 'ORIGIN', source: 'JEPQ' },
  // e) Jan 1 2010-2026 first trading day (h)
  { startDate: '2010-01-04', label: '2010-01-04', descriptor: 'Inicio 2010 (primer día hábil)', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2011-01-03', label: '2011-01-03', descriptor: 'Inicio 2011', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2012-01-03', label: '2012-01-03', descriptor: 'Inicio 2012', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2013-01-02', label: '2013-01-02', descriptor: 'Inicio 2013', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2014-01-02', label: '2014-01-02', descriptor: 'Inicio 2014', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2015-01-02', label: '2015-01-02', descriptor: 'Inicio 2015', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2016-01-04', label: '2016-01-04', descriptor: 'Inicio 2016', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2017-01-03', label: '2017-01-03', descriptor: 'Inicio 2017', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2018-01-02', label: '2018-01-02', descriptor: 'Inicio 2018', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2019-01-02', label: '2019-01-02', descriptor: 'Inicio 2019', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2020-01-02', label: '2020-01-02', descriptor: 'Inicio 2020', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2021-01-04', label: '2021-01-04', descriptor: 'Inicio 2021', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2022-01-03', label: '2022-01-03', descriptor: 'Inicio 2022', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2023-01-03', label: '2023-01-03', descriptor: 'Inicio 2023', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2024-01-02', label: '2024-01-02', descriptor: 'Inicio 2024', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2025-01-02', label: '2025-01-02', descriptor: 'Inicio 2025', category: 'YEAR_START', source: 'NYSE' },
  { startDate: '2026-01-02', label: '2026-01-02', descriptor: 'Inicio 2026', category: 'YEAR_START', source: 'NYSE' },
  // f,g) key events via ^GSPC bottoms
  { startDate: '2020-03-23', label: '2020-03-23', descriptor: 'Bottom COVID (SP500 2237)', category: 'EVENT_BOTTOM', source: '^GSPC' },
  { startDate: '2022-01-03', label: '2022-01-03', descriptor: 'Peak 2021 (SP500 ATH 4796) - ya existe', category: 'EVENT_PEAK', source: '^GSPC' },
  { startDate: '2022-10-12', label: '2022-10-12', descriptor: 'Bottom Fed Rates 2022 (SP500 3577)', category: 'EVENT_BOTTOM', source: '^GSPC' },
  { startDate: '2025-04-08', label: '2025-04-08', descriptor: 'Bottom Trump Aranceles 2025 (SP500 4982)', category: 'EVENT_BOTTOM', source: '^GSPC' },
  { startDate: '2026-04-01', label: '2026-04-01', descriptor: 'Bottom Iran War 2026 (SP500 6575)', category: 'EVENT_BOTTOM', source: '^GSPC' },
];

async function main() {
  for (const d of startDates) {
    await prisma.btStartDate.upsert({
      where: { startDate: new Date(d.startDate) },
      update: { label: d.label, descriptor: d.descriptor, category: d.category, source: d.source, isTradingDay: true },
      create: { startDate: new Date(d.startDate), label: d.label, descriptor: d.descriptor, category: d.category, source: d.source, isTradingDay: true },
    });
  }
  const count = await prisma.btStartDate.count();
  console.log(`Seeded ${startDates.length} startDates, total ${count}`);
  const all = await prisma.btStartDate.findMany({ orderBy: { startDate: 'asc' } });
  for (const r of all) console.log(r.startDate.toISOString().slice(0,10), r.label, r.descriptor, r.category);
}
main().finally(() => prisma.$disconnect());
