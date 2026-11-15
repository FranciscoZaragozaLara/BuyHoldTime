import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from './db-url';
import { syncIndicatorsTable } from '../src/modules/market-data/indicator-sync';

// Actualiza a mano las filas de `indicators` que salen de series (fed_rate, treasury_30y, vix,
// fear_greed, inflation, core_inflation). La sincronización de mercado lo hace sola al terminar.
// Uso: npx ts-node prisma/sync-indicators.ts
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });

syncIndicatorsTable(prisma as any)
  .then((ups) => { for (const u of ups) console.log(`${u.key.padEnd(15)} ${u.value.toFixed(2).padStart(7)}  ${u.status.padEnd(13)} (dato ${u.asOf})`); })
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
