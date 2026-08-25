# Régimenes de Mercado — Documentación Completa

> **Objetivo:** Escanear vulnerabilidades del “bosque seco”. Tres regímenes detectan *combustible* distinto; la *chispa* (gatillo) determina el tipo de crisis. **No implementado aún en backtesting** — solo documentación para consulta.
> Última actualización: 2026-08-24 · Fuente: BuyHoldTime / BestTimeToInvest — Segunda parte (texto completo pegado)

---

## 1. Bosque Seco por Múltiplos Altos — *Riesgo de Duración y Tasas — Régimen de 4 Fases + Sanación*

**Este régimen detecta cuando las acciones están muy sobrevaloradas respecto a su historia reciente y la inflación amenaza la liquidez. Gestiona la exposición mediante **Scaling In/Out por tranches** calibrado dinámicamente contra choques de inflación y tasas.**

- **El Combustible:** Sobrevaloración de ganancias futuras (crecimiento / tecnológicas) + inflación subyacente acelerada.
- **La Chispa:** Subidas de la Fed y salto del Bono 10Y que comprimen múltiplos.

### 1. Condición Estructural: Activación del Régimen — *El Bosque está Seco*

El algoritmo entra en **alerta** y detiene las compras pasivas.

**Regla Matemática:**
```
CAPE > SMA_36M(CAPE) × 1.18  AND  Core CPI YoY ≥4.0% AND Core CPI YoY > SMA_12M(Core CPI YoY) × 1.20
donde Core CPI YoY = (CPILFESL/CPILFESL-12M -1)*100 — SMA_12M YoY mensual
```

> `CAPE` +18% sobre media 3a **y** `Core CPI YoY` ≥4.0% y +20% sobre media 12M YoY → mercado caro **y** liquidez amenazada por inflación.

### 2. Fase Defensiva: Scaling Out — *Protección del Capital*

#### Gatillo 1: Alerta Temprana — *Venta del Tranche del 30%*

Objetivo: asegurar liquidez ante el primer encarecimiento del costo del dinero.

**Regla Macro (cualquiera de las dos):**
```
Δ FED Target > 0  (la Fed ejecuta su primera subida)
OR
Bono 10Y > SMA_200días(Bono 10Y) × 1.20  (rendimiento salta +20% sobre media institucional)
```

**Acción:** Vender tranche del **30%** de la posición en riesgo (activo subyacente: SPY / QQQ / TQQQ) hacia liquidez (SGOV/Cash).
**Exposición:** 70% Riesgo / 30% Cash.

#### Gatillo 2: Venta Total Defensiva — *Venta del Tranche del 70% restante*

Objetivo: refugio absoluto si la restricción monetaria se vuelve extrema.

**Regla Macro (deben cumplirse ambas):**
```
FED > FED_G1 y CPI >SMA36×1.30 y creciente  OR  CPI >4.5% y >CPI_G1 y creciente  +  FED hike en últimos 3m y SPY < SMA50
AND
Core CPI YoY > SMA_36M(Core CPI YoY) × 1.30 AND Core CPI YoY en crecimiento (YoY actual > YoY mes previo)  (inflación +30% y acelerando)
```

**Acción:** Vender tranche restante del **70%**.
**Exposición:** 0% Riesgo / 100% Cash.

### 3. Fase Ofensiva: Scaling In — *Reingreso al Mercado*

#### Gatillo 3: Compra de Asalto — *Inversión del Tranche del 35%*

Objetivo: atrapar el bottom operando la segunda derivada de la inflación (desaceleración), adelantándose al recorte.

**Regla Macro (cualquiera de las dos):**
```
Core CPI acumula 3 meses consecutivos de caídas frente a su último pico
OR
Δ FED Target = 0 durante 2 meses consecutivos (confirmación de Pausa)
```

**Acción:** Comprar tranche del **35%** hacia activo de riesgo (activo subyacente: SPY / QQQ / TQQQ).
**Exposición:** 35% Riesgo / 65% Cash.

#### Gatillo 4: Compra Total de Confirmación — *Inversión del Tranche del 65% restante*

Objetivo: desplegar máximo poder de fuego con **Doble Llave** (Macro + Técnico).

**Llave Macro (cualquiera de las dos):**
```
Core CPI YoY < SMA_12M(Core CPI YoY) × 1.05  (inflación regresa a media anual)
OR
Δ FED Target < 0  (la Fed ejecuta su primer recorte)
```

**Llave Técnica:**
```
Precio > SMA_50días  (índice retoma tendencia alcista institucional)
```

**Acción:** Si se cumplen **ambas llaves** (Macro + Técnica), inyectar tranche final del **65%**.
**Exposición:** 100% Riesgo.

### 4. Regla de Excepción: Sanación Técnica — *Resolución de Falsa Alarma*

**Escenario:** El algoritmo ejecutó Gatillo 1 (vendiendo 30%) por susto inicial con tasas, pero la inflación no detonó Gatillo 2 y el mercado se recuperó.

**Condición Previa:** Portafolio en 70% Riesgo / 30% Cash.

**Regla Matemática:**
```
Core CPI YoY < SMA_12M(Core CPI YoY) × 1.05  AND  Precio > SMA_50días
```

**Acción:** Recomprar e inyectar tranche del **30%** para sanar posición.
**Exposición:** 100% Riesgo.

**Mecánica de la Crisis:** Sin quiebras: tasas al alza comprimen violentamente P/E y CAPE. El Scaling Out/In por tranches protege duración y captura la desinflación.

**Ejemplo Histórico — 2022:** Crédito sano, Nasdaq -35% por Fed subiendo tasas destruyendo valoraciones 2021. Régimen 1 habría escalado out en Gatillo 1 (10Y > SMA200×1.10) y reingresado en Gatillo 3/4 tras pausa de la Fed y Core CPI < SMA12M×1.05 + SMA50.


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
| Múltiplos Altos | Precio relativo (CAPE) + Core CPI YoY — 4 fases Scaling Out/In (30/70 y 35/65) | Armado CAPE>1.18 & CPI YoY≥4.0 & >SMA12×1.20 → G1 Fed>0 o 10Y>1.10 (30%) → G2 Fed≥+0.50 & CPI>1.30 (70%) → G3 3M caídas o Pausa 2M (35%) → G4 CPI<1.05 o Fed<0 + SMA50 (65%) → Sanación | Crisis de Valoración — duración |
| Alta Deuda/PIB | Apalancamiento Sistémico — 4 fases (armado / 2 gatillos / sanación / desarme) | Armado Z>2.0 en 6M → ROC_3M<0 + SMA50 (30%) → ROC_3M<−σ24M (70%) → Z<0 | Crisis de Venta Forzosa — avalancha escalonada |
| Complacencia OAS | Ceguera al Riesgo (Bonos) | Salto de Spreads (>+50 bps) | Crisis de Quiebras (Falta de liquidez) |

> **Nota:** Esta es la única tabla vigente. Las reglas válidas son únicamente las de cada sección: `CAPE>1.18 & CPI YoY≥4.0 & >1.10 + G1/G2 Scaling Out 30/70 + G3/G4 Scaling In 35/65 + Sanación`, `Z>2.0 en 6M (armado con memoria) + ROC_3M/SMA50 (gatillos) + Z<0 (desarme)`, `HY < P20 ó <3.5%`.

---

*Este documento es solo referencia, basado exclusivamente en la segunda parte pegada. La implementación de reglas en backtesting se hará en fase posterior. Ver componente `RegimesDocsTable.tsx` para vista interactiva.*
