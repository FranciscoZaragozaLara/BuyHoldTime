import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    console.log('=== Inspecting JSON Payloads in "snapshots" ===');
    
    // Sample a few snapshots for different companies (e.g. AAPL, NVDA, AVGO)
    const samples: any[] = await prisma.$queryRaw`
      SELECT sn.*, s.ticker, s."companyName"
      FROM "snapshots" sn
      JOIN "stocks" s ON sn."stockId" = s.id
      WHERE sn.tables IS NOT NULL
      ORDER BY sn."scrapeDate" DESC
      LIMIT 3;
    `;

    for (const snap of samples) {
      console.log(`\n==================================================`);
      console.log(`Ticker: ${snap.ticker} (${snap.companyName}) | Date: ${new Date(snap.scrapeDate).toISOString().split('T')[0]}`);
      console.log(`GF Value: $${snap.gfValue} | GF Score: ${snap.gfScore} | Recommendation: ${snap.recommendation}`);
      
      console.log('\n--- SCORES JSON ---');
      console.log(JSON.stringify(snap.scores, null, 2));

      console.log('\n--- TABLES JSON Structure ---');
      if (snap.tables && typeof snap.tables === 'object') {
        const tableKeys = Object.keys(snap.tables);
        console.log(`Table keys (${tableKeys.length}):`, tableKeys);
        for (const k of tableKeys.slice(0, 5)) {
          console.log(`\nSample Table Key "${k}":`);
          console.log(JSON.stringify(snap.tables[k], null, 2).slice(0, 1000));
        }
      }

      console.log('\n--- ANALYST ESTIMATES JSON Structure ---');
      if (snap.analystEstimates) {
        console.log(JSON.stringify(snap.analystEstimates, null, 2).slice(0, 1000));
      }
    }
  } catch (err: any) {
    console.error('Error inspecting JSON payloads:', err);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
