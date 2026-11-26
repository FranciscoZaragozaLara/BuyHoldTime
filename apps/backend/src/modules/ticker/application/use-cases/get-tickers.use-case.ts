import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITickerRepositorySymbol } from '../ports/ticker-repository.interface';
import type { ITickerRepository } from '../ports/ticker-repository.interface';
import { Ticker } from '../../domain/ticker.entity';
import { perfRefs, priceLevels, walk, type PriceLevels, type WalkState } from '../../domain/price-levels';
import { FastSyncTickersUseCase, LIVE_QUOTE_MAX_AGE_MS } from './fast-sync-tickers.use-case';

export type TickerWithLevels = Ticker & { levels: PriceLevels | null };
type Base = { walk: WalkState; refs: ReturnType<typeof perfRefs>; lastDate: string };

/** Fecha de mercado (Nueva York) de un instante: la cotización de las 20:34 ET del 25-nov es del 25, no del 26. */
const nyDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

@Injectable()
export class GetTickersUseCase {
  private readonly logger = new Logger(GetTickersUseCase.name);
  // Recorrido de los cierres por símbolo; se recalcula cuando llega un cierre nuevo o cambia el día (rendimientos).
  private cache: { key: string; bases: Map<string, Base> } | null = null;

  constructor(
    @Inject(ITickerRepositorySymbol)
    private readonly tickerRepository: ITickerRepository,
    private readonly fastSync?: FastSyncTickersUseCase,
  ) {}

  // Listado público (home, precios, sitemap): resumen sin series históricas, con los niveles de precio (máximo
  // histórico, último piso, rendimientos) calculados con los cierres y el precio en vivo. Si la cotización más reciente
  // tiene más de 15 minutos, responde con lo guardado y refresca todas en segundo plano (antes solo se refrescaban al
  // abrir un detalle, así que la lista podía mostrar el cambio del día de horas atrás aunque se recargara).
  async execute(now = Date.now()): Promise<TickerWithLevels[]> {
    const list = await this.tickerRepository.findAllSummary();
    const newest = list.reduce((m, t) => Math.max(m, t.updatedAt ? new Date(t.updatedAt).getTime() : 0), 0);
    if (this.fastSync && list.length > 0 && now - newest > LIVE_QUOTE_MAX_AGE_MS) this.fastSync.refreshAllInBackground();
    const today = nyDate(new Date(now));
    const bases = await this.bases(today).catch((e) => {
      this.logger.warn(`Niveles de precio no disponibles: ${String(e?.message ?? e).slice(0, 200)}`);
      return new Map<string, Base>();
    });
    return list.map((t) => {
      const b = bases.get(t.symbol);
      const live = t.price > 0 && t.updatedAt ? { price: t.price, date: nyDate(new Date(t.updatedAt)) } : null;
      return Object.assign(t, { levels: b ? priceLevels(b.walk, b.refs, live, b.lastDate) : null });
    });
  }

  private async bases(today: string): Promise<Map<string, Base>> {
    const last = await this.tickerRepository.latestCloseDate();
    const key = `${last}|${today}`;
    if (this.cache?.key === key) return this.cache.bases;
    const closes = await this.tickerRepository.findAllCloses();
    const bases = new Map<string, Base>();
    for (const [sym, rows] of closes) {
      if (rows.length === 0) continue;
      bases.set(sym, { walk: walk(rows), refs: perfRefs(rows, today), lastDate: rows[rows.length - 1].date });
    }
    this.cache = { key, bases };
    return bases;
  }
}
