import 'dotenv/config';
import { SyncTickersUseCase } from '../src/modules/ticker/application/use-cases/sync-tickers.use-case';
import { TickerRepositoryImpl } from '../src/modules/ticker/infrastructure/database/ticker.repository.impl';
import { PrismaService } from '../src/prisma/prisma.service';

async function run() {
  const prisma = new PrismaService();
  const repo = new TickerRepositoryImpl(prisma);
  const syncUseCase = new SyncTickersUseCase(repo);
  console.log('Running sync task for all tickers...');
  const result = await syncUseCase.execute();
  console.log('Sync Result:', JSON.stringify(result, null, 2));
}
run().catch(console.error);
