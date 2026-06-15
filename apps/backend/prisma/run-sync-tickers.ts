import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SyncTickersUseCase } from '../src/modules/ticker/application/use-cases/sync-tickers.use-case';

async function bootstrap() {
  console.log('=== Initializing NestJS application context for Ticker Sync ===');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const useCase = app.get(SyncTickersUseCase);
    console.log('Starting sync of tickers, historical prices, and quarterly statement details...');
    const result = await useCase.execute();
    console.log('Sync execution completed successfully:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error executing ticker synchronization:', error);
  } finally {
    await app.close();
    console.log('=== NestJS application context closed ===');
  }
}

bootstrap().catch(console.error);
