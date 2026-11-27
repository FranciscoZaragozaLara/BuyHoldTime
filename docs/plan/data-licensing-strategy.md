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
| 1 | Ficha pública sin GF Score, GF Value ni su etiqueta de valuación, rankings 0–10, tablas de métricas ni estimados de analistas. El API público (`GET /tickers/:symbol`) solo manda perfil y posiciones de ETF (N-PORT, público); el snapshot completo queda en `GET /tickers/:symbol/snapshot` (admin / x-api-key) y en la ficha solo lo ve el admin. Reemplazos propios: **valor estimado BHT** (EPS de 12 meses × (1 + crecimiento propio) × P/E de salida del sector), crecimiento de ingresos/EPS y margen operativo, P/E, P/S, EV/EBIT y rendimiento de utilidades desde EDGAR; la calculadora y la gráfica de EPS proyectan con la **tendencia propia** (EPS e ingresos de EDGAR, 3 años, tope 20 %) en lugar de estimados de analistas. | Hecho (`fix/gurufocus-public-data`) |
| 2 | Balance y flujo de efectivo desde EDGAR en `sync-all-stocks-edgar.ts` (activos, pasivos, capital, efectivo, deuda, flujo operativo, capex, dividendos pagados) → ROE, ROIC, deuda/capital, liquidez, FCF y su margen, payout. Reusar la lógica de `BackTesting/experimental/feeds/edgar_pit.py` (FCF TTM, ROE, ROIC, deuda/EBITDA). Reconstruir la pestaña de tablas con esos datos y la misma lista blanca de `src/lib/fundamentalMetrics.ts`: recupera la mayor parte del contenido. | Pendiente |
| 3 | Puntajes propios 0–10 por bloque (valuación, crecimiento, rentabilidad, solidez, momentum) por percentiles dentro del universo y del sector: sustituyen a los rankings de GuruFocus. | Pendiente |
| 4 | Perfil y posiciones de ETF directo del N-PORT de la SEC. Con eso GuruFocus deja de ser necesario para lo público y queda, si se quiere, como validación interna. | Pendiente |
| — | Estimados de analistas: solo con licencia de un proveedor que permita mostrarlos (decidir cuando haya ingresos). Mientras, proyección propia. | Decisión futura |

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
| 2 | Quitar HY OAS real (ICE) de la UI | Muy bajo | Medio |
| 3 | P/E estimado: mostrar banda, no número | Bajo | Medio |
| 4 | CNN: mostrar solo el puntaje del componente | Bajo | Bajo-medio |
| 5 | GuruFocus fase 2 (balance y flujo de EDGAR) | Medio | Recupera contenido |
| 6 | GuruFocus fases 3–4 | Medio | Alto (independencia) |
| 7 | Índice de sentimiento propio | Medio-alto | Bajo-medio |
| 8 | Proveedor de cierres con licencia | Bajo (costo mensual) | Operativo |

## Regla para contenido nuevo

Antes de mostrar un dato: ¿de dónde viene? Si no es de la lista de fuentes públicas (`src/lib/dataSources.ts`), se
usa solo como insumo de un cálculo propio y la UI muestra el resultado propio, sin el nombre del proveedor.
