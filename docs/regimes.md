# Régimenes de Mercado — Documentación Completa

> **Objetivo:** Escanear vulnerabilidades del “bosque seco”. Tres regímenes detectan *combustible* distinto; la *chispa* (gatillo) determina el tipo de crisis. **No implementado aún en backtesting** — solo documentación para consulta.
> Última actualización: 2026-08-24 · Fuente: BuyHoldTime / BestTimeToInvest — Segunda parte (texto completo pegado)

---

## 1. Bosque Seco por Múltiplos Altos — *Riesgo de Duración y Tasas*

**Este régimen detecta cuando las acciones están extremadamente caras y son vulnerables a cambios en el costo del dinero.**

- **El Combustible:** La sobrevaloración de las ganancias futuras (acciones de crecimiento / tecnológicas).
- **La Chispa que lo detona:** La inflación y las subidas de tasas de la Reserva Federal.

**Regla Matemática:**

```
CAPE > SMA_36M(CAPE) × 1.20
```

> `CAPE` de Shiller por encima de su media móvil 36 meses × 1.20 → múltiplos >20% sobre media de 3 años.

**Mecánica de la Crisis:** No hay quiebras corporativas ni pánico bancario. Las empresas siguen ganando dinero, pero como las tasas de interés suben, los inversores exigen un mayor rendimiento. Los múltiplos (P/E, CAPE) se comprimen violentamente.

**Ejemplo Histórico — 2022:** El crédito corporativo estaba sano, pero el Nasdaq colapsó un 35% simplemente porque la inflación forzó a la Fed a subir las tasas, destruyendo las valoraciones de 2021.

---

## 2. Bosque Seco por Alta Deuda / PIB — *Riesgo de Liquidación Forzosa*

**Este régimen mide el nivel de apalancamiento sistémico. Detecta cuánta deuda están tomando los inversores institucionales y minoristas para comprar acciones.**

- **El Combustible:** Dinero prestado (Margin Debt).
- **La Chispa que lo detona:** Cualquier caída inicial del mercado que detone un Margin Call (llamada de margen).

**Regla Matemática (Z-Score de 3 años):**

```
Z(Margin/GDP) = ( Margin/GDP - SMA_36M(Margin/GDP) ) / σ_36M(Margin/GDP)  >  +2.0
```

> Donde `Margin/GDP = FINRA_DEBIT / GDP ×100`. Z-Score >+2.0 → sistema hiper-apalancado (>2 desviaciones estándar sobre media 36M).

**Mecánica de la Crisis:** Cuando el apalancamiento excede 2 desviaciones estándar (+2.0 Z-Score), el sistema está hiper-apalancado. Si el mercado cae un 5% o 10% por cualquier noticia, los brokers exigen garantías. Los fondos se ven obligados a vender acciones masivamente para cubrir sus deudas, provocando una avalancha de ventas forzosas (venta mecánica sin importar el precio).

**Ejemplo Histórico — 1929 y 2000:** Gran parte de la explosión final de la burbuja Dotcom fue impulsada por deuda de margen extrema que, al desapalancarse, aniquiló el mercado.

---

## 3. Complacencia en Préstamos HY OAS — *Riesgo de Crédito / Quiebra — Complementario*

**Este indicador no mide el mercado de acciones, sino el mercado de bonos basura (High Yield). Mide la ceguera al riesgo: qué tan poco rendimiento extra exigen los inversores para prestarle dinero a empresas al borde de la quiebra.**

> **Regla complementaria:** Este régimen **no se activa por sí solo**. Requiere que el bosque ya esté seco por **altas valoraciones (1. Múltiplos Altos)** o **alto apalancamiento (2. Alta Deuda/PIB)**. La complacencia sin combustible previo no dispara crisis sistémica.

- **El Combustible:** Exceso de confianza e ignorancia del riesgo de impago (Default Risk).
- **La Chispa que lo detona:** Un evento de liquidez, recesión o quiebra inesperada que congela el crédito.

**Regla Matemática (complementaria):**

```
( HY OAS < Percentil_20( HY OAS_36M )  OR  HY OAS < 3.5% )  AND  ( CAPE > SMA_36M(CAPE)×1.20  OR  Z(Margin/GDP) > +2.0 )
```

> `BAMLH0A0HYM2` por debajo del percentil 20 histórico de 36 meses o <3.5% **y** además `CAPE` alto o `Z>2.0` → complacencia con bosque ya seco. Sin 1 o 2, no hay régimen.

**Mecánica de la Crisis:** Cuando el spread (OAS) está en complacencia extrema (por debajo del percentil 20 histórico), el mercado está fijando precios de "perfección absoluta". Significa que el crédito fluye libremente. El peligro es que desde este nivel, el spread solo puede subir. Cuando la realidad golpea y el crédito se congela, las empresas no pueden refinanciar deudas, provocando quiebras y un colapso accionario.

**Ejemplo Histórico — 2007 (antes de la GFC):** El OAS estaba por debajo del 3.0%. Nadie creía que hubiera riesgo. Cuando estalló la crisis subprime en 2008, el OAS saltó a más del 11%.

---

## Resumen de Arquitectura en el Algoritmo

Para un algoritmo robusto, estas tres reglas operan como una **matriz de escaneo de vulnerabilidades**. El “Bosque” puede estar seco por uno, dos o los tres factores al mismo tiempo. **La complacencia (3) es complementaria: solo cuenta si 1 (múltiplos altos) o 2 (alta deuda) ya están activos; nunca dispara régimen por sí sola.**

| Régimen | Qué Mide | Qué lo Detona (El Gatillo) | Tipo de Crisis Resultante |
|---|---|---|---|
| Múltiplos Altos | Precio relativo (CAPE) | Subida de Tasas (Fed) | Crisis de Valoración (Larga duración) |
| Alta Deuda/PIB | Apalancamiento Sistémico | Caída inicial (Margin Calls) | Crisis de Venta Forzosa (Avalancha) |
| Complacencia OAS | Ceguera al Riesgo (Bonos) | Salto de Spreads (>+50 bps) | Crisis de Quiebras (Falta de liquidez) |

> **Nota:** Esta es la única tabla vigente. Las reglas válidas son únicamente las de cada sección: `CAPE > SMA_36M×1.20`, `Z>2.0`, `HY < P20 ó <3.5%`.

---

*Este documento es solo referencia, basado exclusivamente en la segunda parte pegada. La implementación de reglas en backtesting se hará en fase posterior. Ver componente `RegimesDocsTable.tsx` para vista interactiva.*
