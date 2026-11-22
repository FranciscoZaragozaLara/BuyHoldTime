# Plan de implementación · Canary & Phoenix (fase experimental)

**BuyHoldTime · indicadores de techo y suelo, backtest con precios históricos y pipeline de paper trading de opciones**
Versión 1.0 · 21 de noviembre de 2026 · Repos: `BuyHoldTime` (BestTimeToInvest) y `BackTesting`

---

## 0. Resumen

**Objetivo:** validar con evidencia, y sin costo de capital, si el Canary (techos) y el Phoenix (suelos) merecen entrar al semáforo de BuyHoldTime. También se evalúan las estrategias de opciones de la tesis (puts de cobertura y calls de recuperación) mediante paper trading.

**Regla de oro:** nada de esta fase cambia colores, gatillos ni tranches del semáforo. Los indicadores se muestran como **experimentales** hasta cumplir los criterios de promoción (sección 8).

| Fase | Qué produce | Duración estimada |
|---|---|---|
| **0 · Preregistro** | Fórmulas, parámetros y criterios congelados en `scores_v0.yaml` y en la BD | 1–2 días |
| **A · Backtest sin opciones** | Canary-P, CSI sintético y Phoenix sobre 2011–2026, con estudio de eventos e informe | 2–3 semanas |
| **B · Pipeline en vivo** | Snapshots diarios de opciones (IBKR), canastas mensuales, cohortes Fénix, paper trading y scores diarios en la BD | 3–5 semanas, en paralelo con A |
| **C · Evaluación continua** | Informe trimestral y decisión de promoción tras ≥2 correcciones de ≥10% | 1–3 años |

**Tarea urgente (semana 1):** QQQ está en ~−15% desde su máximo de octubre, arriba del umbral de −12% para congelar una cohorte Fénix. Congelarla ahora, aunque el pipeline no esté listo, convierte la corrección actual en el primer caso en vivo (tarea EXP-02).

---

## 1. Principios del experimento

1. **Preregistro:** las fórmulas, pesos, umbrales y criterios de promoción se congelan **antes** de ver resultados. Cualquier cambio crea una versión nueva (`v1`, `v2`…) y la anterior se sigue calculando en paralelo. Nunca se reescribe la historia de una versión.
2. **Point-in-time:** cada dato se guarda con la fecha en que se conoció (`as_of`, `filed_date`, `quote_time`). Los backtests solo usan datos disponibles en esa fecha.
3. **Modo sombra:** los scores se calculan y se publican en la API con la etiqueta `experimental: true`. El termómetro y el MRT no los leen.
4. **Llenados conservadores:** toda operación simulada compra a `mid + 0.25 × spread` y vende a `mid − 0.25 × spread`. Como sensibilidad, también se registra el llenado a punto medio.
5. **Referencias simples:** cada indicador se compara contra alternativas triviales (ratio ARKK/QQQ, amplitud, VIX/VIX3M solo). Si no las supera, no aporta.
6. **Flujo de git:** según `CLAUDE.md`, esta sesión de la app solo planea; **Claude Code hace todas las ramas y commits**, una rama por tarea (sección 9).

---

## 2. Definición de los scores (versión v0, congelada)

### 2.1 Canary-P (versión con precios, para backtest y vivo)

Mide el estrés en activos especulativos sin usar opciones. Escala 0–100.

`Canary-P = 0.40 × A + 0.30 × B + 0.30 × C`

| Componente | Definición |
|---|---|
| **A · Amplitud frágil** | % de la canasta frágil con cierre debajo de su SMA50 |
| **B · Caída frágil** | % de la canasta frágil con caída ≥15% desde su máximo de 63 días |
| **C · Fuerza relativa** | % de los ratios ARKK/QQQ, SPHB/SPLV e IGV/QQQ que están debajo de su media de 50 días |

**Canasta frágil para el backtest:** ETFs que evitan el sesgo de supervivencia de las acciones individuales: ARKK (desde 2014), IGV, IPO (desde 2013), XBI, SPHB (desde 2011), WCLD (desde 2019) y SOXX como referencia de alto beta. Variante A2b (opcional): acciones con FCF < 0 dentro de los componentes históricos del Nasdaq-100.

**Estados (iguales a la tesis):** VERDE 0–25 · AMARILLO 26–55 · ROJO 56–100.

### 2.2 CSI (Canary Stress Index) con opciones

Fórmula de la tesis, sin cambios:

`CSI = 0.50 × (% canasta con ROI ≥ 100%) + 0.30 × (% canasta bajo SMA50) + 0.20 × (ROI promedio acotado a [0, 200%] ÷ 2)`

- **En vivo:** con los puts simulados reales de la sección 6.2 (tramos de los últimos 2 meses).
- **En backtest (CSI sintético):** los puts se valúan con Black-Scholes. IV de entrada = VXN × beta del activo frente a QQQ (beta de 252 días, acotada entre 0.8 y 2.5). Se revalúan a diario con la trayectoria de VXN × beta. Es una aproximación: sirve para comparar con Canary-P, no como prueba del CSI real.

### 2.3 Phoenix Rank (selección de la cohorte)

**Gatillo de congelación:** QQQ ≤ −12% desde su máximo de 252 días **o** VIX > 30 al cierre. Una cohorte por episodio. El episodio termina cuando QQQ recupera su máximo previo.

**Filtros de calidad (point-in-time):** capitalización > USD 15 mil millones, FCF TTM > 0, ROE > 15%, deuda/EBITDA < 1.5x.

`Phoenix Rank = 0.40 × Resiliencia + 0.35 × Calidad + 0.25 × Volumen`

| Componente | Definición (percentiles dentro del universo filtrado) |
|---|---|
| **Resiliencia** | 0.6 × percentil de la pendiente de 15 días de RS (acción/QQQ) + 0.4 × percentil de la caída frente a QQQ desde el máximo de QQQ (menos caída = mejor) |
| **Calidad** | 0.5 × percentil del margen FCF + 0.5 × percentil del ROIC |
| **Volumen** | Percentil del ratio volumen alcista/bajista de 20 días |

**Diversificación:** máximo 2 empresas por sector y 1 por industria. **Tamaño:** 20 empresas (principal) y 10 (sensibilidad, como en la tesis).

**Purga:** una empresa solo se reemplaza si reporta deterioro trimestral de FCF (FCF TTM pasa a negativo) o recorte severo de guía. Queda registrada con fecha y motivo.

### 2.4 Phoenix Score (diario, 0–100)

`Phoenix Score = 0.30 × D + 0.40 × E + 0.30 × F`

| Componente | Definición |
|---|---|
| **D** | % de la cohorte sin un nuevo mínimo de 20 días en las últimas 10 sesiones |
| **E** | % de la cohorte con cierre sobre su EMA21 **y** pendiente de 15 días de RS (acción/QQQ) > 0 |
| **F** | % de la cohorte con cierre sobre su SMA50 |

**Señal de giro (hipótesis H2):** Phoenix Score > 60 **y** VIX/VIX3M < 1.00, con al menos 3 sectores representados entre las empresas que cumplen E.

### 2.5 Parámetros congelados (`BackTesting/experimental/config/scores_v0.yaml`)

```yaml
version: v0
frozen_at: 2026-11-21
canary_p:
  weights: {breadth: 0.40, drawdown: 0.30, rel_strength: 0.30}
  sma: 50
  drawdown: {threshold: 0.15, window: 63}
  ratios: [[ARKK, QQQ], [SPHB, SPLV], [IGV, QQQ]]
  ratio_ma: 50
  states: {green: [0, 25], yellow: [26, 55], red: [56, 100]}
csi:
  weights: {roi100: 0.50, below_sma50: 0.30, roi_capped: 0.20}
  put: {dte: [45, 60], otm: [0.07, 0.10], target_otm: 0.085}
  live_window_tranches: 2
  synthetic: {iv_source: VXN, beta_window: 252, beta_clip: [0.8, 2.5]}
phoenix:
  freeze_trigger: {qqq_drawdown: -0.12, vix_above: 30}
  filters: {mcap_min: 15.0e9, fcf_ttm_min: 0, roe_min: 0.15, debt_ebitda_max: 1.5}
  rank_weights: {resilience: 0.40, quality: 0.35, volume: 0.25}
  cohort_size: {primary: 20, sensitivity: 10}
  max_per_sector: 2
  max_per_industry: 1
  score_weights: {no_new_low: 0.30, ema21_rs: 0.40, sma50: 0.30}
  turn_signal: {score_above: 60, vix_ratio_below: 1.00, min_sectors: 3}
fills:
  buy: mid_plus_quarter_spread
  sell: mid_minus_quarter_spread
  sensitivity: mid
```

---

## 3. Fase A · Backtest con precios históricos (sin opciones)

### 3.1 Hipótesis y métricas

| Hipótesis | Métrica principal | Referencia a superar |
|---|---|---|
| **H1** · El Canary anticipa techos de QQQ | Semanas entre la primera señal AMARILLA/ROJA y el máximo del episodio; falsas alarmas por año | Ratio ARKK/QQQ debajo de su media de 50 días |
| **H2** · El Phoenix anticipa o confirma fondos | Días entre la señal de giro y el mínimo; rendimiento de QQQ a 20/60/120 días desde la señal | VIX/VIX3M < 1 solo; T1 del MRT v1.3 |
| **H3** · El Phoenix mejora las entradas del MRT | Precio promedio de T1–T3 con y sin Phoenix como voto 3 | MRT v1.3 sin voto 3 |
| **H4** · Canary-P y CSI sintético dicen lo mismo | Correlación de estados y diferencia en fechas de señal | — |

**Falsa alarma (H1):** señal ROJA que no va seguida de una caída de QQQ ≥10% en los 90 días hábiles siguientes.

### 3.2 Episodios (definición objetiva)

Episodio = caída de QQQ ≥10% desde su máximo de 252 días. El pico es el máximo previo y el fondo es el mínimo antes de recuperar el pico. Lista esperada desde 2011 (el script la recalcula): 2011, 2015–16, 2018 (oct–dic), 2020, 2022 (varios tramos), 2024 (ago), 2025 (abr) y 2026 (oct–nov, abierto).

Con tan pocos episodios se usa un **estudio de eventos**: una fila por episodio con todas las métricas, sin promedios que oculten los casos.

### 3.3 Datos

| Dato | Fuente | Tabla / archivo |
|---|---|---|
| Precios diarios de ETFs y acciones | yfinance (pipeline existente) | `bt_market_data` (agregar tickers: ARKK, IGV, IPO, XBI, SPHB, SPLV, WCLD, SOXX, más el universo Phoenix) |
| VIX, VIX3M, VXN | CBOE (CSV históricos) | `bt_market_data` con tickers `^VIX`, `^VIX3M`, `^VXN` |
| QQQ, ^NDX | yfinance | `bt_market_data` |
| Componentes históricos del Nasdaq-100 | Tabla de cambios de Wikipedia, compilada a mano | `BackTesting/data/ndx_constituents_pit.csv` (symbol, added, removed) |
| Fundamentales point-in-time | SEC EDGAR companyfacts (ya se usa para EPS) | `exp_fundamentals_pit` con `filed_date` |
| Tasa libre de riesgo | FRED DGS3MO (`fred_api.py`) | Para Black-Scholes del CSI sintético |

**Fundamentales desde EDGAR (Phoenix histórico):**
- FCF = `NetCashProvidedByUsedInOperatingActivities` − `PaymentsToAcquirePropertyPlantAndEquipment` (TTM).
- ROE = utilidad neta TTM ÷ capital contable promedio.
- ROIC ≈ utilidad operativa × (1 − 21%) ÷ (deuda + capital).
- Deuda/EBITDA = (`LongTermDebt` + `DebtCurrent`) ÷ (utilidad operativa + `DepreciationDepletionAndAmortization`).
- Margen FCF = FCF ÷ ingresos TTM.
- Solo se usan valores con `filed` ≤ fecha de congelación. Reutilizar los helpers de `prisma/edgar-duration.ts` (Q4 = anual − Q1..Q3).

**Limitación conocida:** las empresas que salieron del índice y ya no cotizan pueden no tener precios en yfinance. Se documenta cuántas faltan por episodio; si son más del 10% de la cohorte, el resultado de ese episodio se marca como "sesgado".

### 3.4 Scripts (en `BackTesting/experimental/`)

```
experimental/
  config/scores_v0.yaml
  data/load_prices.py           # descarga y upsert en bt_market_data
  data/ndx_constituents.py      # lee ndx_constituents_pit.csv → universo por fecha
  data/edgar_fundamentals.py    # FCF, ROE, ROIC, deuda/EBITDA point-in-time → exp_fundamentals_pit
  scores/canary_p.py            # función pura: precios → Canary-P y estado
  scores/csi.py                 # función pura: tramos de puts → CSI (vivo y sintético)
  scores/synthetic_options.py   # Black-Scholes, beta, IV = VXN × beta
  scores/phoenix.py             # rank, congelación de cohorte, score diario
  backtest/episodes.py          # detecta episodios de QQQ ≥10%
  backtest/event_study.py       # métricas por episodio y referencias
  backtest/run_canary_bt.py     # H1 y H4
  backtest/run_phoenix_bt.py    # H2 y H3 (usa el MRT v1.3 de tranches_reentrada.py)
  reports/build_report.py       # informe MD + gráficas por episodio
  tests/                        # pytest: fórmulas con casos a mano
```

**Requisito:** las fórmulas de `scores/` son funciones puras y testeadas, porque se reutilizan idénticas en el pipeline en vivo (sección 5).

### 3.5 Entregable de la fase A

Informe `BackTesting/docs/Informe_Canary_Phoenix_v0.md` con:

- Tabla de episodios con las métricas de H1–H4.
- Una gráfica por episodio: QQQ, Canary-P/CSI sintético y Phoenix Score, con las fechas de señal marcadas.
- Veredicto por hipótesis: "pasa", "no pasa" o "inconcluso", según los criterios de la sección 8.
- Resultados guardados en `exp_bt_signals` y `exp_bt_events` para mostrarlos en la app.

---

## 4. Arquitectura del pipeline en vivo

```
                 ┌──────────────── VPS Hostinger (docker compose) ────────────────┐
  IBKR  ◄──────► │ ib-gateway (paper, puerto 4002)                                 │
                 │      ▲                                                          │
                 │      │ ib_async                                                 │
                 │ exp-worker (Python 3.11)                                        │
                 │   ├─ universe.py      (mensual)  ◄── FMP / GuruFocus / EDGAR    │
                 │   ├─ canary_basket.py (mensual)                                 │
                 │   ├─ phoenix_cohort.py (al congelar)                            │
                 │   ├─ option_snapshots.py (diario 16:05 ET)                      │
                 │   ├─ paper_engine.py  (diario)                                  │
                 │   └─ daily_scores.py  (diario 22:45 ET)                         │
                 │      │                                                          │
                 │      ▼                                                          │
                 │ PostgreSQL (buyholdtime-db) ◄── backend NestJS ──► frontend     │
                 │   exp_* · bt_market_data · snapshots · data_source_runs         │
                 └─────────────────────────────────────────────────────────────────┘
```

| Componente | Decisión |
|---|---|
| **IB Gateway** | Imagen comunitaria con IBC (inicio de sesión automático) en el `docker-compose.prod.yml`, solo en red interna. IBKR pide reautenticación periódica (normalmente semanal, con 2FA): alerta si el worker no conecta. |
| **Cliente** | `ib_async` (sucesor de `ib_insync`) |
| **Cuenta** | Paper, compartiendo suscripciones con la cuenta real (activarlo en la configuración de IBKR) |
| **Datos de mercado** | Desarrollo: retrasados gratis (`reqMarketDataType(3)`). Registro oficial: OPRA Top of Book, USD 1.50/mes (no profesional) |
| **Credenciales** | Solo en `.env.production` (`IB_USER`, `IB_PASSWORD`, `IB_TRADING_MODE=paper`); nunca en código |
| **Registro de ejecuciones** | Cada job escribe en `data_source_runs` (`source='exp'`, `process='option_snapshots'`, etc.) |

---

## 5. Fase B · Pipeline de datos

### 5.1 Calendario (hora del este de EE.UU.)

| Cuándo | Job | Qué hace |
|---|---|---|
| Primer día hábil del mes, 16:05 | `universe.py` + `canary_basket.py` | Universo líquido, fundamentales, canasta de 10 canarios y compra simulada de sus puts |
| L–V 16:05 | `option_snapshots.py` | Snapshot de las cadenas de opciones de canarios, cohorte Fénix, QQQ y SPY |
| L–V 16:20 | `paper_engine.py` | Marca a mercado, reglas de salida y nuevas entradas de las estrategias de la sección 6 |
| L–V 22:45 | `daily_scores.py` | Canary-P, CSI, Phoenix Score y gatillo de congelación, después de `daily_update.py` (22:05) y amplitud (22:35) |
| Al dispararse el gatillo | `phoenix_cohort.py` | Congela la cohorte del episodio |

Con datos retrasados, el snapshot de las 16:05 captura cotizaciones de ~15:50. Se guarda siempre la hora real de la cotización (`quote_time`).

### 5.2 Universo y fundamentales (mensual)

1. **Candidatos:** acciones de EE.UU. con capitalización > USD 2 mil millones y volumen promedio > 1 millón. Fuente principal: screener de FMP (ya hay `FMP_API_KEY`). Respaldo: scanner de IBKR (filtros de capitalización, volumen y volumen de opciones; máximo 50 resultados por escaneo, así que se hacen varios escaneos por sector).
2. **Fundamentales:** P/S y forward P/E desde `snapshots` del GuruFocus Scrapper cuando existan; FCF desde EDGAR; huecos desde FMP. Se guarda la fuente de cada dato en `exp_fundamentals_pit`.
3. **Cobertura de GuruFocus:** hoy cubre 67 acciones, insuficiente para el screening. Tarea EXP-12: que el Scrapper lea su lista de tickers desde `exp_universe_monthly`.
4. **Liquidez de opciones:** para cada candidato, snapshot del put más cercano a 8.5% OTM y 45–60 días: se exige `(ask − bid) ÷ mid ≤ 0.25`.

### 5.3 Canasta Canary (mensual)

Reglas de la tesis, sin cambios:

1. Liquidez y opciones (5.2).
2. Fragilidad: FCF < 0, P/S > 12x o forward P/E > 55x.
3. Sobreextensión: precio ÷ SMA50 ≥ 1.15 y cierre sobre la EMA20.
4. Orden por mayor extensión sobre la SMA50, máximo 3 por sector. Se anclan ARKK e IGV como referencias fijas.
5. Se registra en `exp_canary_basket` y se abren los puts simulados (6.2).

**Registro paralelo:** el Canary-P en vivo se calcula con la canasta de ETFs de 2.1 **y** con la canasta mensual de acciones, para comparar ambas versiones con datos reales.

### 5.4 Snapshot de opciones (diario)

Por subyacente: `reqSecDefOptParams` → vencimientos y strikes. Solo se piden los contratos necesarios: los de posiciones abiertas, más una "rejilla" fija para QQQ y SPY (vencimientos de 30, 60, 90, 180 y 365 días; strikes desde −20% hasta +15% en pasos de 2.5%).

**Campos guardados:** bid, ask, último, volumen, interés abierto, IV de IBKR (si llega), IV calculada, delta, gamma, vega, theta, precio del subyacente, tipo de dato (live/delayed) y `quote_time`.

**IV y griegas propias:** Black-Scholes con `py_vollib`, r = DGS3MO y q = rendimiento por dividendo del subyacente. Se calculan siempre, aunque IBKR envíe las suyas, para tener un método único.

**Límites de IBKR:** ~100 líneas de datos simultáneas por defecto, así que se piden en lotes de ≤80 y se cancelan al recibir los ticks. Ritmo máximo de ~40 mensajes por segundo.

**Efecto acumulado:** con los años, `exp_option_quotes` se convierte en una base histórica propia de opciones, que IBKR no ofrece para contratos vencidos.

---

## 6. Paper trading de las estrategias de opciones

Cartera virtual de referencia: **USD 100,000**. Todas las órdenes son simuladas en la BD. No se envían órdenes a IBKR, porque su simulador llena con demasiado optimismo.

### 6.1 Modelo de llenado y P&L

- **Compra:** `mid + 0.25 × (ask − bid)`. **Venta:** `mid − 0.25 × (ask − bid)`. Comisión fija de USD 0.65 por contrato.
- **Marca diaria:** a punto medio (informativa) y conservadora (a precio de venta).
- **Spread demasiado amplio:** si `(ask − bid) ÷ mid > 0.40`, la entrada se pospone al día siguiente y se registra el motivo.
- **Vencimiento:** valor intrínseco al cierre del día de vencimiento.

### 6.2 Estrategia 1 · Puts de la canasta Canary (alimenta el CSI)

- **Entrada:** primer día hábil del mes, un put por canario, 45–60 días, strike más cercano a 8.5% OTM (rango 7–10%).
- **Tamaño:** 1 contrato por nombre (el CSI usa ROI, no dinero).
- **Salida:** solo al vencimiento o a los 15 días antes de vencer. Es un sensor, no una estrategia de ganancia.
- **CSI diario:** con los tramos vivos de los últimos 2 meses (ventana de 15–60 días al vencimiento), con la fórmula de 2.2.

### 6.3 Estrategia 2 · Puts de cobertura condicionales (QQQ)

- **Activación:** régimen "Bosque Seco" del Motor A armado **y** IV Rank de QQQ < 25% **y** QQQ sobre su SMA50. Mientras no haya un año de IV propia, el IV Rank usa como sustituto el percentil de 252 días del VXN.
- **Contrato:** put de QQQ, 60–90 días, 7–10% OTM (delta −0.20 a −0.25).
- **Presupuesto:** 0.6% de la cartera virtual por trimestre, solo mientras la activación esté vigente.
- **Con IV alta:** bear put spread (compra −7%, venta −20%).
- **Gestión:** rolar a los 30 días si no hubo caída; vender 50% al llegar a +150%; cerrar todo si VIX > 35 o VIX/VIX3M > 1.15.
- **Métrica clave:** costo anual efectivo frente a la reducción de drawdown de una cartera 100% QQQ.

### 6.4 Estrategia 3 · Calls de recuperación (tranches de la tesis)

| Tranche | Presupuesto | Gatillo | Estructura |
|---|---|---|---|
| R1 · Capitulación | 30% | VIX > 35, VIX/VIX3M gira hacia abajo desde > 1.15 y 3–4 empresas Fénix sin nuevos mínimos | Bull call spread 60–90 días: compra ATM (delta ~0.50), venta +12–15% |
| R2 · Confirmación | 40% | Phoenix Score > 55 y VIX/VIX3M < 1.00 | Igual que R1 |
| R3 · Ruptura | 30% | QQQ sobre su SMA50 y Phoenix Score > 75 | Call LEAPS ITM, 180–365 días, delta 0.75–0.80 |

- **Presupuesto total:** 2.5% de la cartera virtual por episodio.
- **Subyacentes:** 60% en las 3–4 empresas Fénix con mejor rank y 40% en QQQ. Nunca calls sobre canarios.
- **Gestión:** cerrar spreads al 65–75% de su ganancia máxima; convertir LEAPS a posición base al superar +80%; stop si el subyacente cierra debajo del mínimo de capitulación.
- **Comparación obligatoria:** el mismo presupuesto en TQQQ con las fechas de T0–T3 del MRT v1.3. Esto responde si los LEAPS ITM son mejor instrumento que TQQQ.

### 6.5 Fuera de alcance en esta fase

Venta de puts (CSP), bear call spreads y la matriz de puntajes de la tesis (88/75/62…). No tienen respaldo y la venta de puts en un pánico tipo 2008 es peligrosa.

---

## 7. Base de datos

Migración SQL escrita a mano en `apps/backend/prisma/migrations/2026112X000000_add_experimental_canary_phoenix/`, aplicada con `prisma migrate deploy` (**no usar `migrate dev`**, ver HANDOFF). Columnas en snake_case. Después, agregar los modelos a `schema.prisma` y validar con `npx prisma validate`.

```sql
-- Preregistro: cada versión de parámetros, inmutable
CREATE TABLE exp_score_config (
  version      text PRIMARY KEY,
  params       jsonb NOT NULL,
  frozen_at    timestamptz NOT NULL DEFAULT now(),
  notes        text
);

CREATE TABLE exp_universe_monthly (
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

CREATE TABLE exp_fundamentals_pit (
  symbol       text NOT NULL,
  as_of        date NOT NULL,
  source       text NOT NULL,          -- edgar | gurufocus | fmp
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

CREATE TABLE exp_canary_basket (
  month          date NOT NULL,
  symbol         text NOT NULL,
  rank           int  NOT NULL,
  sector         text,
  ext_sma50      double precision,
  fragility      jsonb,                 -- {fcf_neg, ps_gt_12, fpe_gt_55}
  is_anchor      boolean NOT NULL DEFAULT false,
  config_version text NOT NULL REFERENCES exp_score_config(version),
  PRIMARY KEY (month, symbol, config_version)
);

CREATE TABLE exp_phoenix_cohort (
  cohort_id      text NOT NULL,         -- p.ej. 2026-11-QQQ
  symbol         text NOT NULL,
  frozen_at      date NOT NULL,
  cohort_size    int  NOT NULL,         -- 20 o 10
  sector         text,
  industry       text,
  phoenix_rank   double precision,
  components     jsonb,
  status         text NOT NULL DEFAULT 'active',   -- active | purged
  purged_at      date,
  purge_reason   text,
  config_version text NOT NULL REFERENCES exp_score_config(version),
  PRIMARY KEY (cohort_id, symbol, cohort_size)
);

CREATE TABLE exp_option_quotes (
  id            bigserial PRIMARY KEY,
  snapshot_ts   timestamptz NOT NULL,
  quote_time    timestamptz,
  data_type     text NOT NULL,          -- live | delayed
  underlying    text NOT NULL,
  con_id        bigint,
  expiry        date NOT NULL,
  strike        double precision NOT NULL,
  opt_right     char(1) NOT NULL,       -- P | C
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
CREATE INDEX exp_option_quotes_und_ts ON exp_option_quotes (underlying, snapshot_ts DESC);
CREATE INDEX exp_option_quotes_contract ON exp_option_quotes (underlying, expiry, strike, opt_right, snapshot_ts);

CREATE TABLE exp_paper_positions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy       text NOT NULL,         -- canary_put | hedge_put | recovery_bcs | recovery_leaps | tqqq_benchmark
  tranche        text,                  -- R1 | R2 | R3 | mes de la canasta
  episode_id     text,
  underlying     text NOT NULL,
  legs           jsonb NOT NULL,        -- [{expiry, strike, right, side, qty, con_id}]
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

CREATE TABLE exp_paper_marks (
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

CREATE TABLE exp_scores_daily (
  date           date NOT NULL,
  score_key      text NOT NULL,         -- canary_p_etf | canary_p_stocks | csi_live | csi_synthetic | phoenix_score_20 | phoenix_score_10
  config_version text NOT NULL REFERENCES exp_score_config(version),
  value          double precision NOT NULL,
  state          text,                  -- VERDE | AMARILLO | ROJO | GIRO
  components     jsonb,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  is_backfill    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (date, score_key, config_version)
);

CREATE TABLE exp_bt_events (
  episode_id     text PRIMARY KEY,
  peak_date      date NOT NULL,
  trough_date    date,
  recovery_date  date,
  depth          double precision,
  metrics        jsonb                  -- métricas de H1–H4 por variante
);
```

**Separación vivo/backtest:** `is_backfill = true` marca los valores calculados hacia atrás. Solo los valores en vivo (`false`) cuentan para la evaluación de la fase C.

---

## 8. Criterios de promoción (congelados)

| Indicador | Se promueve al semáforo si… | Uso tras la promoción |
|---|---|---|
| **Canary (Canary-P o CSI)** | Adelanto ≥3 semanas frente al máximo de QQQ en al menos 2 de cada 3 techos, ≤1 falsa alarma ROJA por año y supera a la referencia ARKK/QQQ | Alimenta el régimen "Advertencia" del Motor A (lado de venta) |
| **Phoenix Score** | Mejora el precio promedio de T1–T3 del MRT en al menos 2 de cada 3 correcciones, sin retrasar el T0 | Voto 3 del MRT (amplitud de calidad) |
| **Puts condicionales** | Reducen el drawdown máximo de la cartera más de lo que cuestan en rendimiento compuesto | Capa opcional de cobertura en Bosque Seco |
| **LEAPS ITM** | Rendimiento ajustado por riesgo ≥ TQQQ en las mismas fechas, en al menos 2 episodios | Instrumento alternativo para T3/T4 |

**Evaluación:** el backtest de la fase A es necesario pero no suficiente. La decisión final exige además **≥2 correcciones de ≥10% registradas en vivo**. Revisión trimestral con informe automático (`reports/build_report.py`).

---

## 9. Backlog para Claude Code

Una rama por tarea. Al terminar, marcar en `docs/plan/HANDOFF.md` (nueva sección **P7 — Laboratorio Canary/Phoenix**) con rama y commit.

| ID | Repo | Rama | Tarea | Criterio de aceptación |
|---|---|---|---|---|
| EXP-01 | BackTesting | `feat/exp-config-v0` | `scores_v0.yaml` + carga a `exp_score_config` | Fila `v0` en la BD; parámetros idénticos al YAML |
| EXP-02 | BackTesting | `feat/exp-phoenix-freeze-nov26` | **Urgente:** congelar la cohorte Fénix del episodio 2026-11 con EDGAR + precios (script único) | 20 y 10 empresas guardadas con rank y componentes; fecha de congelación registrada |
| EXP-03 | BuyHoldTime | `feat/exp-tables` | Migración SQL de la sección 7 + modelos Prisma | `prisma validate` OK; `migrate deploy` en BD vacía y en la de desarrollo sin drift |
| EXP-04 | BackTesting | `feat/exp-price-data` | Tickers nuevos en `bt_market_data` (ETFs frágiles, ^VIX3M, ^VXN) | Series completas desde su inicio; sin huecos > 3 días hábiles |
| EXP-05 | BackTesting | `feat/exp-scores-pure` | `canary_p.py`, `csi.py`, `synthetic_options.py`, `phoenix.py` con pytest | Casos calculados a mano coinciden; cobertura de las fórmulas al 100% |
| EXP-06 | BackTesting | `feat/exp-edgar-pit` | Fundamentales point-in-time desde EDGAR | AAPL, MSFT y NVDA coinciden con sus 10-Q/10-K en 3 fechas |
| EXP-07 | BackTesting | `feat/exp-ndx-constituents` | `ndx_constituents_pit.csv` desde 2011 | 100 ± 3 miembros en cada fecha; cambios auditables |
| EXP-08 | BackTesting | `feat/exp-backtest-canary` | Episodios, Canary-P y CSI sintético (H1, H4) | Tabla de episodios y gráficas; métricas guardadas en `exp_bt_events` |
| EXP-09 | BackTesting | `feat/exp-backtest-phoenix` | Phoenix histórico (H2, H3) contra el MRT v1.3 | Ídem; reporte de faltantes por sesgo de supervivencia |
| EXP-10 | BackTesting | `feat/exp-report-v0` | Informe de la fase A | `docs/Informe_Canary_Phoenix_v0.md` con veredicto por hipótesis |
| EXP-11 | BuyHoldTime | `feat/exp-ib-gateway` | Servicio ib-gateway (paper) en compose prod + healthcheck | El worker conecta y lee la hora del servidor; alerta si no conecta |
| EXP-12 | GuruFocus Scrapper | `feat/exp-universe-list` | Leer tickers de `exp_universe_monthly` | Snapshots de los candidatos del mes en `snapshots` |
| EXP-13 | BackTesting | `feat/exp-universe-canary` | `universe.py` + `canary_basket.py` | Canasta mensual con reglas 1–4; reproducible con los datos del día |
| EXP-14 | BackTesting | `feat/exp-option-snapshots` | `option_snapshots.py` (ib_async, lotes ≤80, IV/griegas propias) | Snapshot diario completo en < 10 min; `quote_time` y `data_type` en cada fila |
| EXP-15 | BackTesting | `feat/exp-paper-engine` | `paper_engine.py`: estrategias 6.2–6.4 + benchmark TQQQ | Pruebas con cotizaciones grabadas: llenados, rolls, stops y vencimientos correctos |
| EXP-16 | BackTesting | `feat/exp-daily-scores` | `daily_scores.py` + gatillo de congelación Phoenix | Una fila por score y día en `exp_scores_daily`; registro en `data_source_runs` |
| EXP-17 | BuyHoldTime | `feat/exp-api` | Módulo NestJS `experimental`: `GET /api/experimental/scores`, `/paper/positions`, `/phoenix/cohort` | Tests Jest; cada respuesta lleva `experimental: true` |
| EXP-18 | BuyHoldTime | `feat/exp-lab-page` | Página "Laboratorio" en el frontend: scores, canasta, cohorte y P&L simulado | Etiqueta "experimental" visible; no toca el termómetro ni el MRT |
| EXP-19 | BuyHoldTime | `chore/exp-opra-switch` | Cambio a datos en tiempo real (OPRA) cuando el pipeline sea estable | Variable `IB_MARKET_DATA_TYPE=1`; fecha de inicio del registro oficial anotada en `exp_score_config.notes` |

**Orden sugerido:** EXP-01 → EXP-02 (urgente) → EXP-03 → EXP-04/05/06 en paralelo → EXP-07 → EXP-08/09 → EXP-10. En paralelo: EXP-11 → EXP-13/14 → EXP-15/16 → EXP-17/18 → EXP-19.

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Sobreajuste al cambiar parámetros tras ver resultados | Preregistro y versionado inmutable (sección 1) |
| Sesgo de supervivencia en Phoenix histórico | Componentes point-in-time + reporte de faltantes por episodio |
| Fundamentales con look-ahead | Solo valores con `filed_date` ≤ fecha de uso |
| Llenados optimistas en pánico | Modelo `mid ± 0.25 × spread` y regla de spread máximo |
| IB Gateway desconectado (2FA semanal) | Healthcheck, alerta y registro de días perdidos en `data_source_runs` |
| Pocos episodios para concluir | Estudio de eventos, criterios por mayoría de episodios y horizonte de 1–3 años |
| Datos retrasados sin griegas | IV y griegas propias con `py_vollib` siempre |
| Crons duplicados | Un solo worker experimental activo (variable `EXP_CRON=off` en el que no se use), igual que los crons actuales |

---

## 11. Relación con el MRT v1.3

- **Phoenix:** si se promueve, reemplaza al voto 3 (amplitud) del MRT.
- **Canary:** si se promueve, alimenta el régimen "Advertencia" del Motor A, del lado de la venta. No interviene en las compras.
- **Calls de recuperación:** sus gatillos se parecen al T0–T2 del MRT. El paper trading responde si las opciones (spreads y LEAPS) superan a QQQ/TQQQ en los mismos momentos.
- **Matriz de las 4 estaciones** (techo → caída → suelo → recuperación): marco de comunicación para la app, alineado con los colores del semáforo (Canary + Motor A · veto rojo · T0 morado · T1–T3 verde).

*Documento de investigación cuantitativa. No es asesoría financiera.*
