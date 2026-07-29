import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FastSyncTickersUseCase } from '../src/modules/ticker/application/use-cases/fast-sync-tickers.use-case';

async function bootstrap() {
  console.log('=== Fast Live Price Sync (Optimized Quote Sync) ===');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const useCase = app.get(FastSyncTickersUseCase);
    const symbolsArg = process.argv.slice(2);

    if (symbolsArg.length > 0) {
      console.log(`Starting fast live sync for symbols: ${symbolsArg.join(', ')}...`);
      const result = await useCase.executeAll(symbolsArg);
      console.log('Sync result:', result);
    } else {
      console.log('Starting fast live sync for all 67 stocks/ETFs...');
      const startTime = Date.now();
      const result = await useCase.executeAll();
      const durationMs = Date.now() - startTime;
      console.log(`Fast live sync completed in ${(durationMs / 1000).toFixed(2)}s: ${result.updatedCount} tickers updated.`);
    }
  } catch (error) {
    console.error('Error executing fast live sync:', error);
  } finally {
    await app.close();
  }
}

bootstrap().catch(console.error);
