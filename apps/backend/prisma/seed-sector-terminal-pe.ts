import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Sector Terminal P/E Benchmarks (5-Year Long-Term Stabilized Multiples)
const SECTOR_BENCHMARKS: Record<string, { name: string; terminalPe: number }> = {
  Technology: { name: 'Tecnología', terminalPe: 26.5 },
  'Financial Services': { name: 'Servicios Financieros', terminalPe: 14.5 },
  Healthcare: { name: 'Salud & Biotecnología', terminalPe: 19.5 },
  'Consumer Cyclical': { name: 'Consumo Cíclico', terminalPe: 21.0 },
  'Consumer Defensive': { name: 'Consumo Defensivo', terminalPe: 20.5 },
  'Communication Services': { name: 'Servicios de Comunicación', terminalPe: 19.0 },
  Industrials: { name: 'Industrial & Infraestructura', terminalPe: 19.0 },
  Energy: { name: 'Energía', terminalPe: 13.0 },
  'Real Estate': { name: 'Bienes Raíces / REITs', terminalPe: 16.0 },
  Index: { name: 'Índice de Mercado (S&P 500)', terminalPe: 22.0 },
  ETF: { name: 'Fondo / ETF', terminalPe: 22.0 },
};

// Specific Ticker Overrides & Fine-tuning
const SPECIFIC_TICKER_SECTORS: Record<string, { sector: string; terminalPe: number }> = {
  // Broad Market ETFs
  VOO: { sector: 'Index', terminalPe: 22.0 },
  SPY: { sector: 'Index', terminalPe: 22.0 },
  VTI: { sector: 'Index', terminalPe: 22.0 },
  QQQ: { sector: 'Index (Tech)', terminalPe: 25.0 },
  TQQQ: { sector: 'Index (Tech)', terminalPe: 25.0 },
  SCHD: { sector: 'ETF (Dividend)', terminalPe: 16.5 },
  SMH: { sector: 'Technology (Semi)', terminalPe: 26.5 },
  SOXX: { sector: 'Technology (Semi)', terminalPe: 26.5 },
  SOXL: { sector: 'Technology (Semi)', terminalPe: 26.5 },
  IBB: { sector: 'Healthcare (Biotech)', terminalPe: 20.0 },
  NLR: { sector: 'Energy (Nuclear)', terminalPe: 18.0 },

  // Individual Stocks (Fine-tuned)
  NVDA: { sector: 'Technology', terminalPe: 28.0 },
  AAPL: { sector: 'Technology', terminalPe: 26.5 },
  MSFT: { sector: 'Technology', terminalPe: 27.0 },
  AMZN: { sector: 'Consumer Cyclical', terminalPe: 24.0 },
  GOOGL: { sector: 'Communication Services', terminalPe: 21.0 },
  META: { sector: 'Communication Services', terminalPe: 21.5 },
  TSLA: { sector: 'Consumer Cyclical', terminalPe: 28.0 },
  AVGO: { sector: 'Technology', terminalPe: 25.5 },
  AMD: { sector: 'Technology', terminalPe: 26.0 },
  ASML: { sector: 'Technology', terminalPe: 27.0 },
  MU: { sector: 'Technology', terminalPe: 22.0 },
  QCOM: { sector: 'Technology', terminalPe: 22.0 },
  MRVL: { sector: 'Technology', terminalPe: 25.0 },
  LRCX: { sector: 'Technology', terminalPe: 24.5 },
  KLAC: { sector: 'Technology', terminalPe: 25.0 },
  CDNS: { sector: 'Technology', terminalPe: 28.0 },
  SHOP: { sector: 'Technology', terminalPe: 28.0 },
  PLTR: { sector: 'Technology', terminalPe: 30.0 },
  CRWD: { sector: 'Technology', terminalPe: 30.0 },
  PANW: { sector: 'Technology', terminalPe: 28.0 },
  FTNT: { sector: 'Technology', terminalPe: 26.0 },

  // Financials
  JPM: { sector: 'Financial Services', terminalPe: 13.5 },
  V: { sector: 'Financial Services', terminalPe: 22.0 },
  MA: { sector: 'Financial Services', terminalPe: 23.0 },
  BRK_B: { sector: 'Financial Services', terminalPe: 18.0 },
  'BRK.B': { sector: 'Financial Services', terminalPe: 18.0 },
  CME: { sector: 'Financial Services', terminalPe: 19.0 },
  HOOD: { sector: 'Financial Services', terminalPe: 22.0 },

  // Healthcare / Pharma
  LLY: { sector: 'Healthcare', terminalPe: 25.0 },
  UNH: { sector: 'Healthcare', terminalPe: 19.5 },
  VRTX: { sector: 'Healthcare', terminalPe: 22.0 },
  GILD: { sector: 'Healthcare', terminalPe: 17.5 },
  ISRG: { sector: 'Healthcare', terminalPe: 28.0 },

  // Consumer
  KO: { sector: 'Consumer Defensive', terminalPe: 21.0 },
  COST: { sector: 'Consumer Defensive', terminalPe: 26.0 },
  WMT: { sector: 'Consumer Defensive', terminalPe: 22.0 },
  MNST: { sector: 'Consumer Defensive', terminalPe: 23.0 },
  SBUX: { sector: 'Consumer Cyclical', terminalPe: 21.0 },
  BKNG: { sector: 'Consumer Cyclical', terminalPe: 21.0 },
  MAR: { sector: 'Consumer Cyclical', terminalPe: 20.0 },
  PDD: { sector: 'Consumer Cyclical', terminalPe: 18.0 },

  // Communication & Media
  NFLX: { sector: 'Communication Services', terminalPe: 24.0 },
  T: { sector: 'Communication Services', terminalPe: 12.0 },

  // Industrials & Energy
  HON: { sector: 'Industrials', terminalPe: 19.0 },
  CEG: { sector: 'Industrials', terminalPe: 20.0 },
  XOM: { sector: 'Energy', terminalPe: 13.0 },

  // Real Estate
  EQIX: { sector: 'Real Estate', terminalPe: 22.0 },
  MPT: { sector: 'Real Estate', terminalPe: 14.0 },
};

async function main() {
  console.log('=== Seeding Sector & SectorTerminalPE for all Tickers ===');
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    const tickers = await prisma.ticker.findMany();
    console.log(`Found ${tickers.length} tickers in database.`);

    let updatedCount = 0;
    for (const t of tickers) {
      const sym = t.symbol.toUpperCase();
      let targetSector = t.sector || 'Technology';
      let targetTerminalPe = 22.0;

      // 1. Check specific overrides first
      if (SPECIFIC_TICKER_SECTORS[sym]) {
        targetSector = SPECIFIC_TICKER_SECTORS[sym].sector;
        targetTerminalPe = SPECIFIC_TICKER_SECTORS[sym].terminalPe;
      } else if (SECTOR_BENCHMARKS[t.sector]) {
        targetSector = t.sector;
        targetTerminalPe = SECTOR_BENCHMARKS[t.sector].terminalPe;
      }

      await prisma.ticker.update({
        where: { id: t.id },
        data: {
          sector: targetSector,
          sectorTerminalPe: targetTerminalPe,
        },
      });

      console.log(`Updated ${sym.padEnd(6)} -> Sector: "${targetSector}", Terminal PE: ${targetTerminalPe}x`);
      updatedCount++;
    }

    console.log(`\nSuccessfully updated ${updatedCount} tickers with Sector and SectorTerminalPE!`);
  } catch (err: any) {
    console.error('Error seeding SectorTerminalPE:', err);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
