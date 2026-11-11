# Régimenes de Mercado — Documentación Completa

> **Objetivo:** Escanear vulnerabilidades del “bosque seco”. Tres regímenes detectan *combustible* distinto; la *chispa* (gatillo) determina el tipo de crisis.
> Última actualización: 2026-08-26 · Fuente: BuyHoldTime / BestTimeToInvest — Activo en backtesting: `SPY_REGIMEN1`, `SPY_REGIMEN3`, `TQQQ_REGIMEN1`, `TQQQ_EXCLUSIVE_R1R3_V2` (mutex `G2 1.00`)

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
Bono 10Y > SMA_200días(Bono 10Y) × 1.10  (rendimiento salta +10% sobre media institucional — afinado 1.10 vs 1.20)
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

## 3. Complacencia Crediticia & Riesgo Sistémico (HY OAS) — *Riesgo de Crédito, Liquidez y Quiebras Sistémicas — 4 Fases + Sanación*

> **Estado:** Activo desde 2026-08-25 — `SPY_REGIMEN3` 1993-01-29 / `TQQQ_EXCLUSIVE_R1R3_V2` 2010-02-11. Umbrales afinados 5.0%/1.5σ/**1.00%** tras simulación `TQQQ 2011` (0.75% disparaba bear -19% falso; 1.00% lo convierte en `SAN`). `G2 0.75%` legacy en `SPY_COMBINED_R1R3`; `1.00%` vigente en `TQQQ_EXCLUSIVE_V2`.

### 1. Objetivo del Régimen
Proteger el portafolio contra el **congelamiento del crédito, crisis de liquidez interbancaria y quiebras sistémicas masivas**, utilizando el diferencial de bonos de alto rendimiento (High Yield Option-Adjusted Spread — `BAMLH0A0HYM2`) en combinación con confirmación técnica de la acción del precio (`SMA_50/30/100`).

### 2. Estado de Armado (Fase de Vigilancia)
El sistema **no puede disparar defensas** a menos que el mercado se encuentre en **complacencia extrema previa**:

**Regla de Armado (ventana móvil 6 meses):**
```
ARMADO si  HY OAS < Percentil_20( HY OAS_36M )  en algún momento de los últimos 6 meses
```
Significado: El mercado de deuda cobra muy poco riesgo → escenario típico previo a burbuja/sobrecalentamiento. Es condición **necesaria pero no suficiente**; sin armado no hay G1/G2.

> Fuente `BAMLH0A0HYM2`, ventana 36M para percentil, ventana 6M para armado. Ejemplo 2007: OAS <3.0% → 2008 >11%.

### 3. Gatillos de Salida / Defensa — Scaling Out

#### Gatillo 1 — Alerta Temprana (30% → SGOV) — *Doble Llave Estricta*
Propósito: Reducir exposición preventiva ante encarecimiento anormal del endeudamiento.

**Condiciones (ambas):**
```
Macro (Doble Llave Estricta):
  Δ HY OAS_3M > 1.5 × σ_24M(Δ HY OAS_3M)  AND  HY OAS > 5.0%
  (spread sube >1.5σ en 3M y nivel absoluto >5.0%)
AND
Técnico:
  Precio < SMA_50días  (subyacente pierde tendencia institucional de mediano plazo)
```
**Acción:** Venta 30% a Cash/SGOV.
**Exposición:** 70% Riesgo / 30% Cash.

#### Gatillo 2 — Pánico Sistémico (70% restante → SGOV) — *Doble Llave de Pánico*
Propósito: Botón de emergencia ante colapso vertical del crédito.

**Condiciones (ambas):**
```
Macro (Violencia de Mercado — cualquiera):
  Δ HY OAS_1M ≥ +1.00%  OR  HY OAS > SMA_36M(HY OAS) × 1.30
  (salto ≥100pb en 1M o +30% sobre media 36M — TQQQ_EXCLUSIVE_V2; 0.75% legacy SPY)
AND
Técnico:
  Precio < SMA_50días
```
**Acción:** Venta 70% restante.
**Exposición:** 0% Riesgo / 100% Cash (defensa total).

### 4. Gatillo de Sanación — Recuperación Parcial
Escenario: Solo G1 ejecutado (70/30), G2 nunca activado.

**Condiciones (ambas):**
```
Macro:
  HY OAS < SMA_3M(HY OAS)
  (spread perfora a la baja su media 3M → presión cedió)
AND
Técnico:
  Precio > SMA_50días
```
**Acción:** Recompra 30% → **100% Riesgo** (restauración completa).

### 5. Gatillos de Reingreso Post-Evacuación Total — Scaling In

#### Gatillo 3 — Primera Recompra Post-Crisis (0% → 30%)
Escenario: Portafolio 100% cash tras G2.

**Condiciones (ambas):**
```
Macro:
  HY OAS < SMA_3M(HY OAS)
AND
Técnico:
  Precio > SMA_30días  (S&P 500 supera media corta)
```
*Nota de Ingeniería:* Configurado en `SMA_30` para velocidad en rebotes; evaluar alternativa `SMA_50` para mitigar bull traps.
**Acción:** Inyección primer bloque.
**Exposición:** 30% Riesgo / 70% Cash.

#### Gatillo 4 — Reingreso Masivo (30% → 100%)
Escenario: Con G3 ejecutado (30%), confirma fin del peligro sistémico.

**Condiciones (ambas):**
```
Macro (Fin del Peligro):
  HY OAS < SMA_12M(HY OAS)
  (spread perfora media 1 año → normalización bonos)
AND
Técnico (Tendencia Mediano-Largo Plazo):
  Precio > SMA_100días  (S&P 500 consolida recuperación)
```
*Nota de Ingeniería:* Configurado en `SMA_100` para reducir cash drag; documentada opción `SMA_200` como estándar institucional estricto.
**Acción:** Recompra restante → **100% Riesgo / 0% Cash** (normalizado).

**Mecánica de la Crisis:** Con `OAS` en complacencia extrema (<P20), el spread solo puede subir. Cuando el crédito se congela, empresas no refinancian → quiebras y colapso accionario. Los gatillos escalonan salida/entrada por `σ_24M`, `SMA_50/30/100` y medias `3M/12M/36M`.

**Ejemplo Histórico — 2007-2008:** OAS <3.0% complacencia → salto >11% → Régimen 3 habría hecho `G1` con `Δ3M>1.2σ + >4.3% + <SMA50` y evacuación `G2` con `Δ1M≥+0.50%`.

---

## Resumen de Arquitectura en el Algoritmo

Para un algoritmo robusto, estas tres reglas operan como una **matriz de escaneo de vulnerabilidades**. El “Bosque” puede estar seco por uno, dos o los tres factores al mismo tiempo. **La complacencia (3) es complementaria: solo cuenta si 1 (múltiplos altos) o 2 (alta deuda) ya están activos; nunca dispara régimen por sí sola.**

| Régimen | Qué Mide | Qué lo Detona (El Gatillo) | Tipo de Crisis Resultante |
|---|---|---|---|
| Múltiplos Altos | Precio relativo (CAPE) + Core CPI YoY — 4 fases Scaling Out/In (30/70 y 35/65) | Armado CAPE>1.18 & CPI YoY≥4.0 & >SMA12×1.20 → G1 Fed>0 o 10Y>1.10 (30%) → G2 Fed≥+0.50 & CPI>1.30 (70%) → G3 3M caídas o Pausa 2M (35%) → G4 CPI<1.05 o Fed<0 + SMA50 (65%) → Sanación | Crisis de Valoración — duración |
| Alta Deuda/PIB | Apalancamiento Sistémico — 4 fases (armado / 2 gatillos / sanación / desarme) | Armado Z>2.0 en 6M → ROC_3M<0 + SMA50 (30%) → ROC_3M<−σ24M (70%) → Z<0 | Crisis de Venta Forzosa — avalancha escalonada |
| Complacencia Crediticia HY OAS | Ceguera al Riesgo + Liquidez Sistémica — 4 fases + Sanación | Armado HY < P20_36M en 6M → G1 Δ3M>1.5σ & >5.0% + <SMA50 (30%) → G2 Δ1M≥+1.00% o >SMA36M×1.30 (70%) → Sanación <SMA3M + >SMA50 → G3 <SMA3M + >SMA30 (30%) → G4 <SMA12M + >SMA100 (70%) · **TQQQ_EXCLUSIVE_V2 1.00%** | Crisis de Quiebras/Liquidez — congelamiento crédito |

> **Nota:** Esta es la única tabla vigente. Las reglas válidas son únicamente las de cada sección: `R1: CAPE>1.18 & CPI≥4.0 & >1.20 + G1/G2 30/70 + G3/G4 35/65 + Sanación (10Y×1.10)`, `R2: Z>2.0 en 6M + ROC_3M/SMA50 + Z<0`, `R3: HY<P20 en 6M → G1 Δ3M>1.5σ & >5.0% + <SMA50 (30%) → G2 Δ1M≥+1.00% o >SMA36M×1.30 (70%) → G3 <SMA3M+>SMA30 (30%) → G4 <SMA12M+>SMA100 (70%) · V2 1.00%`. `SPY_COMBINED_R1R3` legacy 0.75% · `TQQQ_EXCLUSIVE_V2` 1.00%.

---

*Documento vivo — thresholds e indicadores coinciden con backtesting. Mutex exclusivo `TQQQ_EXCLUSIVE_V2` (`G2 1.00%`) documentado arriba. Ver `RegimesDocsTable.tsx` para vista interactiva.*
