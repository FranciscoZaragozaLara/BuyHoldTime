# Régimenes de Mercado — Documentación

> **Objetivo:** Clasificar el entorno para adaptar la estrategia. **No implementado aún en backtesting** — solo documentación para consulta.
> Última actualización: 2026-08-24 · Fuente: BuyHoldTime / BestTimeToInvest

## Resumen

| Régimen | Qué Mide | Qué lo Detona (El Gatillo) | Tipo de Crisis Resultante | Indicador Clave | Umbral Orientativo |
|---|---|---|---|---|---|
| **Múltiplos Altos** | Precio relativo (**CAPE** Shiller) | **Subida de Tasas (Fed)** `DFEDTARU` / `DGS10` | **Crisis de Valoración** — larga duración, drawdown lento pero profundo | `CAPE` vs `mean3Y` (`CAPE Ratio`) | `CAPE > 30` o `Ratio > 1.25` |
| **Alta Deuda/PIB** | Apalancamiento sistémico | **Caída inicial (Margin Calls)** — `FINRA_DEBIT / GDP *100` | **Crisis de Venta Forzosa** — avalancha, liquidación en cascada | `Margin/GDP` | `> 4.0%` (alerta), `>5%` estrés |
| **Complacencia OAS** | Ceguera al riesgo (bonos) | **Salto de Spreads** `BAMLH0A0HYM2` `>+50 bps` en ventana corta | **Crisis de Quiebras** — falta de liquidez, default en cascada | `BAMLH0A0HYM2` (HY OAS) | `>5%` o `Δ +0.50%` rápido |

## Detalle por Régimen

### 1) Múltiplos Altos — *Precio relativo*
- **Qué mide:** Cuán caro está el mercado respecto a beneficios reales de 10 años (CAPE). `Ratio = CAPE / mean3Y`.
- **Gatillo:** Endurecimiento monetario. Subida de Fed Funds y 10Y encarece el descuento de flujos y pincha múltiplos.
- **Crisis resultante:** De valoración. Corrección larga (meses-años), no flash crash. Ej.: 2000, 2021→2022.
- **Señal en tabla Evolución:** `Ratio >1.25` + `CAPE >30` + `FED ↑` simultáneo.
- **Nota:** No gatilla venta forzosa por sí solo; necesita catalizador de tasas.

### 2) Alta Deuda/PIB — *Apalancamiento sistémico*
- **Qué mide:** `Margin Debt / GDP` — cuánto apalancamiento hay en el sistema respecto al tamaño de la economía.
- **Gatillo:** Una caída inicial (ej. -3% SP500) genera *margin calls*; el desapalancamiento forzado amplifica la caída.
- **Crisis resultante:** Venta forzosa / avalancha. Velocidad > profundidad inicial. Ej.: 2008, 2020-marzo (parcial).
- **Señal en tabla Evolución:** `Margin/GDP >4%` + `Régimen Neutral→Stress` + `VIX o drawdown` incipiente.
- **Nota:** Es el “combustible”, no la chispa.

### 3) Complacencia OAS — *Ceguera al riesgo*
- **Qué mide:** Estrechez del spread high-yield (`HY OAS`). Spread bajo = mercado cree que no hay riesgo.
- **Gatillo:** Salto de spreads `>+50 bps` en días/semanas — el mercado repricing crédito.
- **Crisis resultante:** Quiebras / falta de liquidez. El crédito se cierra, empresas zombis caen. Ej.: 2008 crédito, 2020 HY.
- **Señal en tabla Evolución:** `HY OAS <3%` complacencia profunda → `>5%` estrés; `Δ +0.5%` en 1M es alerta.
- **Nota:** Es el mejor *early warning* de “risk-off” antes de que lo vea el equity.

## Cómo usar la tabla Evolución

- **Filtro:** `Evolución — Daily/Monthly/Yearly` ya muestra `Régimen`, `Portafolio`, `Perf.`, `CAGR`, `DD` por fecha. Usa `Ratio`, `Margin/GDP` y `HY OAS` para mapear a esta documentación.
- **Próximos triggers (no implementados):** `CAPE>30 o Margin>5 → 50% cash`, `HY>5 → 100% cash`, `cruce medias`, `inversión curva`.
- **Referencia rápida en UI:** Ver `RegimesDocsTable` en `apps/frontend/src/components/backtesting/RegimesDocsTable.tsx`.

---
*Este documento es solo referencia. La implementación de reglas de cambio de régimen en backtesting se hará en una fase posterior.*
