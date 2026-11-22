-- Laboratorio Canary & Phoenix (fase experimental, plan BackTesting/docs/PlanExperimental_Canary_Phoenix.md §7).
-- Solo informativo: el termómetro/BHT y el MRT no leen estas tablas. Idempotente.

CREATE TABLE IF NOT EXISTS exp_score_config (
  version      text PRIMARY KEY,
  params       jsonb NOT NULL,
  frozen_at    timestamptz NOT NULL DEFAULT now(),
  notes        text
);

CREATE TABLE IF NOT EXISTS exp_universe_monthly (
  as_of        date NOT NULL,
  symbol       text NOT NULL,
  market_cap   double precision,
  avg_volume   double precision,
  sector       text,
  industry     text,
  option_spread_pct double precision,
  source       text NOT NULL,
  PRIMARY KEY (as_of, symbol)
);

CREATE TABLE IF NOT EXISTS exp_fundamentals_pit (
  symbol       text NOT NULL,
  as_of        date NOT NULL,
  source       text NOT NULL,
  filed_date   date,
  fcf_ttm      double precision,
  fcf_margin   double precision,
  ps_ratio     double precision,
  forward_pe   double precision,
  roe          double precision,
  roic         double precision,
  debt_ebitda  double precision,
  PRIMARY KEY (symbol, as_of, source)
);

CREATE TABLE IF NOT EXISTS exp_canary_basket (
  month          date NOT NULL,
  symbol         text NOT NULL,
  rank           int  NOT NULL,
  sector         text,
  ext_sma50      double precision,
  fragility      jsonb,
  is_anchor      boolean NOT NULL DEFAULT false,
  config_version text NOT NULL REFERENCES exp_score_config(version),
  PRIMARY KEY (month, symbol, config_version)
);

CREATE TABLE IF NOT EXISTS exp_phoenix_cohort (
  cohort_id      text NOT NULL,
  symbol         text NOT NULL,
  frozen_at      date NOT NULL,
  cohort_size    int  NOT NULL,
  sector         text,
  industry       text,
  phoenix_rank   double precision,
  components     jsonb,
  status         text NOT NULL DEFAULT 'active',
  purged_at      date,
  purge_reason   text,
  config_version text NOT NULL REFERENCES exp_score_config(version),
  PRIMARY KEY (cohort_id, symbol, cohort_size)
);

-- source: yahoo (retrasado, v0) | ibkr (cuando se conecte IB Gateway).
CREATE TABLE IF NOT EXISTS exp_option_quotes (
  id            bigserial PRIMARY KEY,
  snapshot_ts   timestamptz NOT NULL,
  quote_time    timestamptz,
  data_type     text NOT NULL,
  source        text NOT NULL DEFAULT 'yahoo',
  contract_symbol text,
  underlying    text NOT NULL,
  con_id        bigint,
  expiry        date NOT NULL,
  strike        double precision NOT NULL,
  opt_right     char(1) NOT NULL,
  bid           double precision,
  ask           double precision,
  last          double precision,
  volume        bigint,
  open_interest bigint,
  iv_ibkr       double precision,
  iv_calc       double precision,
  delta         double precision,
  gamma         double precision,
  vega          double precision,
  theta         double precision,
  und_price     double precision
);
CREATE INDEX IF NOT EXISTS exp_option_quotes_und_ts ON exp_option_quotes (underlying, snapshot_ts DESC);
CREATE INDEX IF NOT EXISTS exp_option_quotes_contract ON exp_option_quotes (underlying, expiry, strike, opt_right, snapshot_ts);

CREATE TABLE IF NOT EXISTS exp_paper_positions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy       text NOT NULL,
  tranche        text,
  episode_id     text,
  underlying     text NOT NULL,
  legs           jsonb NOT NULL,
  opened_at      date NOT NULL,
  entry_price    double precision NOT NULL,
  entry_price_mid double precision,
  status         text NOT NULL DEFAULT 'open',
  closed_at      date,
  exit_price     double precision,
  exit_price_mid double precision,
  exit_reason    text,
  config_version text NOT NULL REFERENCES exp_score_config(version)
);

CREATE TABLE IF NOT EXISTS exp_paper_marks (
  position_id    uuid NOT NULL REFERENCES exp_paper_positions(id) ON DELETE CASCADE,
  date           date NOT NULL,
  mark_mid       double precision,
  mark_conservative double precision,
  und_price      double precision,
  iv             double precision,
  delta          double precision,
  roi_pct        double precision,
  PRIMARY KEY (position_id, date)
);

CREATE TABLE IF NOT EXISTS exp_scores_daily (
  date           date NOT NULL,
  score_key      text NOT NULL,
  config_version text NOT NULL REFERENCES exp_score_config(version),
  value          double precision NOT NULL,
  state          text,
  components     jsonb,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  is_backfill    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (date, score_key, config_version)
);

CREATE TABLE IF NOT EXISTS exp_bt_events (
  episode_id     text PRIMARY KEY,
  peak_date      date NOT NULL,
  trough_date    date,
  recovery_date  date,
  depth          double precision,
  metrics        jsonb
);
