# Régimenes de Mercado — Documentación Completa

> **Objetivo:** Escanear vulnerabilidades del “bosque seco”. Tres regímenes detectan *combustible* distinto; la *chispa* (gatillo) determina el tipo de crisis. **No implementado aún en backtesting** — solo documentación para consulta.
> Última actualización: 2026-08-24 · Fuente: BuyHoldTime / BestTimeToInvest

---

## Resumen — Matriz de Escaneo

| Régimen | Qué Mide | Qué lo Detona (El Gatillo) | Tipo de Crisis Resultante |
|---|---|---|---|
| **Múltiplos Altos** | Precio relativo (CAPE) | Subida de Tasas (Fed) | Crisis de Valoración — larga duración |
| **Alta Deuda/PIB** | Apalancamiento sistémico | Caída inicial (Margin Calls) | Crisis de Venta Forzosa — avalancha |
| **Complacencia OAS** | Ceguera al riesgo (bonos) | Salto de Spreads (>+50 bps) | Crisis de Quiebras — falta de liquidez |

> **Arquitectura del algoritmo:** Las tres reglas operan como matriz de escaneo. El bosque puede estar seco por 1, 2 o los 3 factores al mismo tiempo. A más factores activos, mayor fragilidad sistémica.

---

## 1. Bosque Seco por Múltiplos Altos — *Riesgo de Duración y Tasas*

**Detecta cuando las acciones están extremadamente caras y son vulnerables a cambios en el costo del dinero.**

- **El Combustible:** La sobrevaloración de las ganancias futuras (acciones de crecimiento / tecnológicas).
- **La Chispa que lo detona:** La inflación y las subidas de tasas de la Reserva Federal.

**Regla Matemática:**

```
CAPE > SMA_36M(CAPE) × 1.20
```

> `CAPE` de Shiller por encima de su media móvil 36 meses × 1.20 → múltiplos >20% sobre media de 3 años.

**Mecánica de la Crisis:** No hay quiebras corporativas ni pánico bancario. Las empresas siguen ganando dinero, pero como las tasas suben, los inversores exigen mayor rendimiento. Los múltiplos (P/E, CAPE) se comprimen violentamente.

**Ejemplo Histórico — 2022:** El crédito corporativo estaba sano, pero el Nasdaq colapsó un 35% simplemente porque la inflación forzó a la Fed a subir las tasas, destruyendo las valoraciones de 2021.

**Indicador en Evolución:** `CAPE` y `CAPE Ratio = CAPE / mean3Y` + `FED (DFEDTARU)` y `DGS10` en alza.

---

## 2. Bosque Seco por Alta Deuda / PIB — *Riesgo de Liquidación Forzosa*

**Mide el nivel de apalancamiento sistémico. Detecta cuánta deuda toman inversores institucionales y minoristas para comprar acciones.**

- **El Combustible:** Dinero prestado (Margin Debt).
- **La Chispa que lo detona:** Cualquier caída inicial del mercado que detone un *Margin Call* (llamada de margen).

**Regla Matemática (Z-Score 3 años):**

```
Z(Margin/GDP) = ( Margin/GDP - SMA_36M(Margin/GDP) ) / σ_36M(Margin/GDP)  >  +2.0
```

> Donde `Margin/GDP = FINRA_DEBIT / GDP ×100`. Z-Score >+2.0 → sistema hiper-apalancado (>2σ sobre media 36M).

**Mecánica de la Crisis:** Cuando el apalancamiento excede +2.0 Z-Score, el sistema está hiper-apalancado. Si el mercado cae 5–10% por cualquier noticia, los brokers exigen garantías. Los fondos se ven obligados a vender masivamente para cubrir deudas, provocando avalancha de ventas forzosas (venta mecánica sin importar el precio).

**Ejemplo Histórico — 1929 y 2000:** Gran parte de la explosión final de la burbuja Dotcom fue impulsada por deuda de margen extrema que, al desapalancarse, aniquiló el mercado.

**Indicador en Evolución:** `Margin/GDP` (`FINRA_DEBIT / GDP`) con Z-Score 36M.

---

## 3. Complacencia en Préstamos HY OAS — *Riesgo de Crédito / Quiebra*

**No mide acciones, sino bonos basura (High Yield). Mide la ceguera al riesgo: qué tan poco rendimiento extra exigen los inversores para prestarle a empresas al borde de la quiebra.**

- **El Combustible:** Exceso de confianza e ignorancia del riesgo de impago (Default Risk).
- **La Chispa que lo detona:** Un evento de liquidez, recesión o quiebra inesperada que congela el crédito.

**Regla Matemática:**

```
HY OAS < Percentil_20( HY OAS_36M )   OR   HY OAS < 3.5%
```

> `BAMLH0A0HYM2` por debajo del percentil 20 de 36 meses o <3.5% → complacencia extrema.

**Mecánica de la Crisis:** Cuando el spread (OAS) está en complacencia extrema (por debajo del percentil 20), el mercado fija precios de “perfección absoluta”. El crédito fluye libre. El peligro es que desde ese nivel el spread solo puede subir. Cuando la realidad golpea y el crédito se congela, las empresas no pueden refinanciar, provocando quiebras y colapso accionario.

**Ejemplo Histórico — 2007 (antes de la GFC):** El OAS estaba por debajo de 3.0%. Nadie creía que hubiera riesgo. Cuando estalló la crisis subprime en 2008, el OAS saltó a más del 11%.

**Indicador en Evolución:** `BAMLH0A0HYM2` y su percentil 36M; salto `>+50 bps` como confirmación de estrés.

---

## Resumen de Arquitectura en el Algoritmo

Para un algoritmo robusto, estas tres reglas operan como **matriz de escaneo de vulnerabilidades**. El “Bosque” puede estar seco por uno, dos o los tres factores al mismo tiempo:

| Régimen | Qué Mide | Qué lo Detona (El Gatillo) | Tipo de Crisis Resultante |
|---|---|---|---|
| Múltiplos Altos | Precio relativo (CAPE) | Subida de Tasas (Fed) | Crisis de Valoración (Larga duración) |
| Alta Deuda/PIB | Apalancamiento Sistémico | Caída inicial (Margin Calls) | Crisis de Venta Forzosa (Avalancha) |
| Complacencia OAS | Ceguera al Riesgo (Bonos) | Salto de Spreads (>+50 bps) | Crisis de Quiebras (Falta de liquidez) |

> **Uso en tabla Evolución:** Cada fila `Daily/Monthly/Yearly` ya expone `CAPE`, `Ratio`, `Margin/GDP`, `HY OAS`, `FED`. Mapea esos valores a esta documentación para clasificar el régimen vigente. Los *triggers* (`cruce medias`, `inversión curva`, `HY>5%`, `Margin>5%`) se añadirán como nuevas `bt_strategies` sin tocar este documento.

---

*Este documento es solo referencia. La implementación de reglas de cambio de régimen en backtesting se hará en una fase posterior. Ver componente `RegimesDocsTable.tsx` para vista interactiva en la app.*
