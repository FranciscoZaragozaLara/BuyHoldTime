# Estrategia de datos: mantener el valor del contenido reduciendo el riesgo de licencias

Fecha: 26-nov-2026. No es opinión legal: antes de cobrar, revisión de un abogado (ver P5 del HANDOFF).

## Principios

1. **Lo público se construye con datos públicos**: SEC EDGAR (reportes y N-PORT), FRED (series sin restricción),
   BLS, BEA, Tesoro, Shiller (Yale), FINRA.
2. **Los datos de terceros entran como insumo, no como contenido**: alimentan modelos propios (BHT, valuación,
   tranches) y lo que se muestra es el resultado propio (puntaje, banda, señal, valor estimado), no el número del
   proveedor ni su nombre.
3. **Se licencia solo lo que aporta algo que no podemos replicar** (estimados de analistas, cotizaciones en tiempo
   real), y cuando haya ingresos que lo justifiquen.
4. Si una fuente pide atribución en sus términos, se cumple; si exige licencia para mostrarla, no se muestra.

## Por fuente

### GuruFocus — riesgo alto (fácil de detectar: GF Score, GF Value y rankings son números únicos)

| Fase | Qué | Estado |
|---|---|---|
| 1 | Ficha pública sin GF Score, GF Value ni su etiqueta de valuación, rankings 0–10, tablas de métricas ni estimados de analistas. El API público (`GET /tickers/:symbol`) solo manda perfil y posiciones de ETF (N-PORT, público); el snapshot completo queda en `GET /tickers/:symbol/snapshot` (admin / x-api-key) y en la ficha solo lo ve el admin. Reemplazos propios: **valor estimado BHT** (EPS de los próximos 12 meses × P/E de salida del sector), crecimiento de ingresos/EPS y margen operativo, P/E, P/S, EV/EBIT y rendimiento de utilidades desde EDGAR. | Hecho (`fix/gurufocus-public-data`) |
| 1b | **Proyección de EPS mezclada (decisión del usuario, temporal hasta licenciar):** 40 % modelo propio (EPS de 12 meses normalizado, crecimiento reciente de ingresos y utilidad operativa que se desvanece hacia 6 % con constante de 2 años; parámetros calibrados con el consenso agregado) + 60 % consenso de analistas del snapshot (fila contable "EPS ($)", ≤120 días, cierres fiscales a ≥6 meses). Se calcula en el backend (`domain/eps-projection.ts`): los estimados crudos no salen; sin modelo propio no hay proyección (no se publica el consenso solo). La UI lo dice: "combinación de un modelo propio con datos históricos de los reportes a la SEC (40 %) y el consenso de analistas disponible (60 %), que suele incorporar la guía de las empresas". `ANALYST_BLEND=off` → solo el modelo. Riesgo asumido: sigue siendo un derivado de los datos de GuruFocus (términos de uso). | Hecho (`fix/gurufocus-public-data`) |
| 2 | Balance y flujo de efectivo desde EDGAR en `sync-all-stocks-edgar.ts` (activos, pasivos, capital, efectivo, deuda, flujo operativo, capex, dividendos pagados) → ROE, ROIC, deuda/capital, liquidez, FCF y su margen, payout. Reusar la lógica de `BackTesting/experimental/feeds/edgar_pit.py` (FCF TTM, ROE, ROIC, deuda/EBITDA). Reconstruir la pestaña de tablas con esos datos y la misma lista blanca de `src/lib/fundamentalMetrics.ts`: recupera la mayor parte del contenido. | Pendiente |
| 3 | Puntajes propios 0–10 por bloque (valuación, crecimiento, rentabilidad, solidez, momentum) por percentiles dentro del universo y del sector: sustituyen a los rankings de GuruFocus. | Pendiente |
| 4 | Perfil y posiciones de ETF directo del N-PORT de la SEC. Con eso GuruFocus deja de ser necesario para lo público y queda, si se quiere, como validación interna. | Pendiente |
| — | Estimados de analistas con licencia de un proveedor que permita mostrarlos: sustituye al consenso de GuruFocus en la mezcla (mismo formato de puntos por cierre fiscal). Prioridad alta. | Pendiente |
| — | Guía de las empresas (comunicados de resultados en el 8-K): componente público adicional de la proyección. Hoy **no** se usa; la etiqueta no debe decir que sí hasta implementarlo. | Pendiente |

**Comparación A/B (26-nov-2026, 102 acciones, EPS a ~2 años):** modelo anterior (CAGR 3 años, tope 20 %) 16.9 % de diferencia mediana contra el consenso; modelo con desvanecimiento calibrado 12.8 %; mezcla 60/40 5.1 %. Contra el EPS real (proyecciones 2015–2024) ningún modelo histórico mejora: anterior 23 % a 1 año y 33 % a 2 años, nuevo 25 % y 34 %. La exactitud adicional viene del consenso; el error histórico de los analistas no se pudo medir (sin estimados de años pasados). Ejemplos a ~2 años (consenso / modelo / mezcla): NVDA 16.86 / 17.89 / 17.27, AVGO 27.39 / 16.61 / 23.07, GOOGL 18.32 / 16.17 / 17.46. ASML no tiene trimestres en EDGAR (20-F): sin proyección.

### WSJ / Birinyi (Dow Jones) — riesgo medio (muy celosos; detección media)

- Corto plazo: el P/E estimado del S&P 500 y del Nasdaq 100 entra al termómetro como insumo; en lo público mostrar
  su banda o puntaje, no el número exacto ni el EPS.
- La amplitud (volumen que sube/baja) son datos genéricos de la bolsa: bajo riesgo. A mediano plazo, calcularla
  con los cierres del universo propio.
- Largo plazo: licenciar estimados o prescindir del componente (backtest del BHT sin él).

### ICE (HY OAS vía FRED) — restricción explícita, eliminación casi gratis

- El modelo usa la serie propia (1.913 × spread Baa de FRED); el HY OAS real solo se muestra como referencia.
  **Dejar de mostrarlo** elimina el riesgo sin cambiar nada del modelo.
- Spread Baa de Moody's (FRED BAA10Y): se muestra transformado; riesgo bajo, revisar términos de FRED.

### CNN Fear & Greed — riesgo bajo-medio (operativo: endpoint no oficial)

- Corto plazo: mostrar solo su aporte al BHT (puntaje del componente), no la serie cruda. Si se muestra el valor,
  citar a CNN es lo que hace la prensa y suele tolerarse; mostrarlo sin fuente y con otro nombre puede verse peor.
- Mediano plazo: índice de sentimiento propio con datos públicos o propios (VIX, momentum del S&P contra su media,
  spreads de crédito, demanda de refugio bonos vs acciones, amplitud del universo), recalibrar el BHT con
  backtest y retirar CNN.

### Yahoo Finance — riesgo legal bajo, operativo alto

- Cierres diarios: hechos, idénticos en cualquier fuente. Riesgo práctico bajo.
- Intradía en tiempo real: requiere licencia de la bolsa para mostrarse; mostrar con retraso y leyenda.
- Al monetizar: proveedor de cierres con licencia de redistribución (plan de pago económico) como reemplazo directo
  del API no oficial.

## Prioridad

| # | Acción | Esfuerzo | Reduce riesgo |
|---|---|---|---|
| 1 | GuruFocus fase 1 | Hecho | Alto |
| 2 | Quitar HY OAS real (ICE) de la UI | Hecho (`fix/third-party-values-display`) | Medio |
| 3 | P/E estimado: mostrar banda, no número | Hecho, salvo pendientes abajo | Medio |
| 4 | CNN: decisión del usuario = mostrar el valor **citando a CNN** ("Fear & Greed (CNN)", "Fuente: CNN Business") | Hecho | Bajo-medio |
| 5 | GuruFocus fase 2 (balance y flujo de EDGAR) | Medio | Recupera contenido |
| 6 | GuruFocus fases 3–4 | Medio | Alto (independencia) |
| 7 | Índice de sentimiento propio | Medio-alto | Bajo-medio |
| 8 | Proveedor de cierres con licencia | Bajo (costo mensual) | Operativo |

## Regla para contenido nuevo

Antes de mostrar un dato: ¿de dónde viene? Si no es de la lista de fuentes públicas (`src/lib/dataSources.ts`), se
usa solo como insumo de un cálculo propio y la UI muestra el resultado propio, sin el nombre del proveedor.

## Ajuste de visualización (26-nov-2026, `fix/third-party-values-display`)

- **ICE:** fuera el "HY OAS real" (componentes, detalle del BHT, tranches; también del JSON de `thermo-live`,
  `bht-tranches` y `bht-forward/detail`). Tablas y gráficas históricas (CAPE diario, evolución de regímenes, margen/PIB)
  y el motor de regímenes heredado usan `HY_MODEL` = 1.913477 × BAA10Y (serie sintética del API, igual al proxy guardado
  hasta 18-ago-2023); columnas "HY EY" (ICE) eliminadas. Efecto en la regla R3 heredada (HY < 3.5 %) desde ago-2023:
  676 → 747 de 814 días. BHT, bonus y tranches no cambian (ya usaban la serie del modelo).
- **WSJ/Birinyi:** el P/E estimado se muestra como banda (Barato/Justo/Caro/Elevado/Extremo, `src/lib/bandOnly.ts`) en
  la home, el resumen del BHT, los componentes, el detalle del cálculo y el orbe (sin valor ni historia de valores);
  columna "Fwd PE" de la tabla del CAPE eliminada; el panel de indicadores ya no baja SPX_FWD_EPS / NDX_PE / NDX_FWD_PE.
- **API:** `GET /api/backtesting/market-data` y `/market-data/live` no sirven al público BAMLH0A0HYM2, BAMLH0A0HYM2EY,
  SPX_FWD_EPS, NDX_PE ni NDX_FWD_PE (403); sí a la red interna (scripts de backtest, render de Next) o con x-api-key
  (`licensed-series.ts`).
- **CNN:** valor visible con atribución: "Fear & Greed (CNN)", "Fuente: CNN Business"; la marca de fecha del componente
  dice "· CNN".

**Pendiente:**
- El valor del P/E estimado sigue en el JSON público de `thermo-live` / `thermo-parts-monthly` (parte `FWD.value`) y
  en `/indicators` (`fwd_pe_ratio`): la UI ya no lo muestra; quitarlo del JSON exige derivar la banda en el backend.
- ~~Gráfica de valuación de `/indicators`: P/E mensual del Nasdaq 100 de GuruFocus y WSJ/Birinyi~~ → hecho
  (28-nov-2026, `feat/own-ndx-pe`): P/E propio con EDGAR de los miembros (`NDX_PE_EDGAR`, desde 2011). Sigue el P/E
  mensual de QQQ guardado en el ticker (GuruFocus/WSJ, `historical_eps_quarterly.peRatio`) para las tablas de precios
  de QQQ/TQQQ: revisar si se muestra en público y cambiarlo por `NDX_PE_EDGAR`.

