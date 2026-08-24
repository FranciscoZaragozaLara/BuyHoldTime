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

## 2. Bosque Seco por Alta Deuda / PIB — *Riesgo de Liquidación Forzosa — Régimen de 4 Fases*

**Este régimen mide el nivel de apalancamiento sistémico. Detecta cuánta deuda toman los inversores para comprar acciones y gestiona la exposición mediante un estado de *armado* persistente.**

- **El Combustible:** Dinero prestado (Margin Debt).
- **La Chispa:** Caída inicial que detona Margin Calls y desapalancamiento.

### Fase 1: El Armado — *Condición de Peligro Sistémico*

El algoritmo se pone en **alerta máxima** y detiene las compras rutinarias. Es un **estado con memoria**: una vez armado, se mantiene aunque `Z` baje, hasta que ocurra sanación (Fase 3) o desarme total (Fase 4).

**Regla Matemática (ventana de monitoreo 6 meses):**

```
ARMADO si  Z(Margin/GDP) > +2.0  en cualquier momento de los últimos 6 meses
donde Z(Margin/GDP) = ( Margin/GDP − SMA_36M ) / σ_36M
      Margin/GDP = FINRA_DEBIT / GDP ×100  (serie mensual, 36M)
```

> `Z > +2.0` → sistema hiper-apalancado (>2σ sobre media 36M). El *armado* persiste — no se desactiva por simple caída de `Z`.

### Fase 2: Scaling Out — *Fase de Venta Defensiva*

#### Gatillo 1: Alerta Temprana — *Vender Tranche del 30%*

Objetivo: reducir exposición ante primeros síntomas de que el mercado no puede sostener el peso de su deuda.

**Llave Macro (Inicio del Desapalancamiento):**
```
ROC_3M(Margin/GDP) < 0
```
La deuda trimestral ha dejado de crecer y comienza a contraerse.

**Llave Técnica:**
```
Precio de Cierre del Índice < SMA_50días
```

**Acción:** Si el mercado rompe su media institucional a la baja **y** los inversores empiezan a reducir margen, se vende el primer tranche del 30%.
**Exposición:** 70% Riesgo / 30% Cash.

#### Gatillo 2: Pánico de Margin Call — *Vender Tranche del 70% restante*

Objetivo: evacuar el mercado porque el desapalancamiento se ha vuelto violento e incontrolable (liquidación forzosa).

**Gatillo Macro (Desapalancamiento Acelerado):**
```
ROC_3M(Margin/GDP) < −1 × σ_24M( ROC_3M )
```
La caída trimestral rompe el "piso de ruido" y supera la volatilidad histórica de los últimos 2 años.

**Acción:** Confirmación absoluta. Se vende el tranche final del 70%.
**Exposición:** 0% Riesgo / 100% Cash.

### Fase 3: Regla de Sanación — *Falsa Alarma*

**Escenario:** El algoritmo ejecutó el Gatillo 1 (vendió 30%) por un ligero tropiezo, pero los grandes bancos no entraron en pánico (Gatillo 2 nunca se disparó) y el precio se recuperó.

**Regla Matemática:**
```
Precio de Cierre > SMA_50días  AND  ROC_3M(Margin/GDP) > 0
```

**Acción:** El algoritmo inyecta de regreso el tranche del 30% para devolver el portafolio al **100% de exposición**.

### Fase 4: El Desarme Total — *Fin de la Crisis*

**Regla Matemática:**
```
Z(Margin/GDP) < 0
```

**Lógica:** La avalancha purgó por completo el sistema; el nivel de deuda regresó por debajo de su promedio histórico de 3 años. **El régimen se desactiva.**

> **Nota de implementación — estado con memoria:** El monitoreo mantiene `ARMADO=true` desde el primer `Z>2.0` en 6M hasta que `Z<0` (Fase 4) o sanación (Fase 3 tras Gatillo 1). No basta con que `Z` baje de 2.0 para desarmar.

**Mecánica de la Crisis:** Con `ARMADO`, una caída 5-10% detona margin calls → venta forzosa mecánica, avalancha sin importar precio. Los gatillos 1 y 2 escalonan la salida según `ROC_3M` y `SMA_50`.

**Ejemplo Histórico — 1929 y 2000:** Burbuja Dotcom impulsada por margen extremo → desapalancamiento aniquiló mercado; 1929 colapso por apalancamiento sistémico similar.

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
| Alta Deuda/PIB | Apalancamiento Sistémico — 4 fases (armado / 2 gatillos / sanación / desarme) | Armado Z>2.0 en 6M → ROC_3M<0 + SMA50 (30%) → ROC_3M<−σ24M (70%) → Z<0 | Crisis de Venta Forzosa — avalancha escalonada |
| Complacencia OAS | Ceguera al Riesgo (Bonos) | Salto de Spreads (>+50 bps) | Crisis de Quiebras (Falta de liquidez) |

> **Nota:** Esta es la única tabla vigente. Las reglas válidas son únicamente las de cada sección: `CAPE > SMA_36M×1.12`, `Z>2.0 en 6M (armado con memoria) + ROC_3M/SMA50 (gatillos) + Z<0 (desarme)`, `HY < P20 ó <3.5%`.

---

*Este documento es solo referencia, basado exclusivamente en la segunda parte pegada. La implementación de reglas en backtesting se hará en fase posterior. Ver componente `RegimesDocsTable.tsx` para vista interactiva.*
