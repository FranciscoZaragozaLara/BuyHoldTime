import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'child_process';
import * as path from 'path';
import { BACKTEST_DIR } from '../../config/backtest-dir';
import { PYTHON_BIN } from '../../config/python-bin';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Laboratorio Canary & Phoenix (plan BackTesting/docs/PlanExperimental_Canary_Phoenix.md): solo lectura para la página
 * «Laboratorio» y crons que corren BackTesting/experimental/daily.py. Informativo: el termómetro/BHT y el MRT no lo leen.
 * EXP_CRON=off apaga los crons (como TICKER_SYNC_CRON / EDGAR_SYNC_CRON: un solo backend con crons activos).
 */
@Injectable()
export class ExperimentalService {
  private readonly logger = new Logger(ExperimentalService.name);
  private running = false;
  constructor(private readonly prisma: PrismaService) {}

  private get cronOn() { return (process.env.EXP_CRON ?? 'on') !== 'off'; }

  // Cerca del cierre: cotizaciones de opciones del día, scores y paper trading.
  @Cron('50 15 * * 1-5', { timeZone: 'America/New_York' })
  async nearClose() { if (this.cronOn) await this.run('snapshot,scores,paper'); }

  // Tras el sync diario (22:05) y la amplitud (22:35): precios, corrida mensual si toca y scores con los cierres.
  @Cron('50 22 * * 1-5', { timeZone: 'America/New_York' })
  async afterClose() { if (this.cronOn) await this.run('prices,monthly,scores'); }

  run(steps = 'prices,monthly,snapshot,scores,paper'): Promise<{ ok: boolean; output: string }> {
    if (this.running) return Promise.resolve({ ok: false, output: 'ya hay una corrida en curso' });
    this.running = true;
    return new Promise((resolve) => {
      const proc = spawn(PYTHON_BIN, [path.join(BACKTEST_DIR, 'experimental', 'daily.py'), steps], { cwd: path.join(BACKTEST_DIR, 'experimental'), env: process.env });
      let out = '';
      proc.stdout.on('data', (d) => (out += d.toString()));
      proc.stderr.on('data', (d) => (out += d.toString()));
      proc.on('close', (code) => {
        this.running = false;
        this.logger.log(`exp daily.py ${steps} → ${code}`);
        resolve({ ok: code === 0, output: out.slice(-4000) });
      });
    });
  }

  /** Todo lo que muestra la página Laboratorio en una respuesta. */
  async summary() {
    const q = <T = any>(sql: string, ...p: unknown[]) => this.prisma.$queryRawUnsafe<T[]>(sql, ...p);
    // v0 = parámetros congelados del plan; versiones posteriores = hipótesis nuevas (p. ej. v1 riesgo de techo).
    const configs = await q(`SELECT version, frozen_at::text AS frozen_at, notes FROM exp_score_config ORDER BY frozen_at`);
    const config = configs[0];
    const latest = await q(`SELECT DISTINCT ON (score_key) score_key, date::text AS date, value, state, components, is_backfill
      FROM exp_scores_daily ORDER BY score_key, is_backfill ASC, date DESC`);
    const [m] = await q<{ month: string }>(`SELECT max(month)::text AS month FROM exp_canary_basket`);
    const basket = m?.month ? await q(`SELECT symbol, rank, sector, ext_sma50, fragility, is_anchor FROM exp_canary_basket WHERE month = $1::date ORDER BY is_anchor, rank`, m.month) : [];
    const [coh] = await q<{ cohort_id: string; frozen_at: string }>(`SELECT cohort_id, min(frozen_at)::text AS frozen_at FROM exp_phoenix_cohort GROUP BY cohort_id ORDER BY 2 DESC LIMIT 1`);
    const cohort = coh ? await q(`SELECT symbol, cohort_size, sector, industry, phoenix_rank, components, status FROM exp_phoenix_cohort WHERE cohort_id = $1 ORDER BY cohort_size DESC, phoenix_rank DESC`, coh.cohort_id) : [];
    const positions = await q(`SELECT p.id, p.strategy, p.tranche, p.episode_id, p.underlying, p.legs, p.opened_at::text AS opened_at, p.entry_price, p.entry_price_mid,
        p.status, p.closed_at::text AS closed_at, p.exit_price, p.exit_reason, m.date::text AS mark_date, m.mark_mid, m.mark_conservative, m.roi_pct
      FROM exp_paper_positions p LEFT JOIN LATERAL (SELECT * FROM exp_paper_marks WHERE position_id = p.id ORDER BY date DESC LIMIT 1) m ON true
      ORDER BY p.status, p.opened_at DESC`);
    const events = await q(`SELECT episode_id, peak_date::text AS peak_date, trough_date::text AS trough_date, recovery_date::text AS recovery_date, depth, metrics FROM exp_bt_events ORDER BY peak_date`);
    const [snap] = await q(`SELECT max(snapshot_ts)::text AS ts, count(*)::int AS n FROM exp_option_quotes WHERE snapshot_ts > now() - interval '4 days'`);
    return { experimental: true, config, configs, latest, basket: { month: m?.month ?? null, members: basket }, cohort: { ...(coh ?? {}), members: cohort }, positions, events, options: snap };
  }

  /** Serie de un score (backfill + vivo) para las gráficas. */
  async scores(key: string, from?: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT date::text AS date, value, state, is_backfill FROM exp_scores_daily WHERE score_key = $1 AND date >= $2::date ORDER BY date`, key, from ?? '2011-01-01');
    return { experimental: true, key, rows };
  }
}
