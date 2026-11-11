# Semáforo Cuantitativo de Riesgo y Oportunidad

Este documento establece las reglas algorítmicas para el modelo de rotación de ETFs (QQQ, VOO, SCHD, XLRE, XLF, SGOV) basado en la liquidez del sistema (M0 y M2) y los shocks de inflación (Petróleo WTI).

## 1. Módulo de Liquidez (M0 y M2)

*El oxígeno del sistema financiero y el estado del crédito bancario.*

### 🔴 Riesgo Máximo (Corto Plazo): "Cruce de la Muerte Monetario"
Ocurre cuando la FED entra en pánico inyectando liquidez, pero el sistema bancario congela el crédito.
* **Condición Matemática:** `Delta M0 (1 a 3 meses) > +5%` **Y** `M2 YoY < 0%`
* **Confirmación:** `HY Spread > 6%` (Si es menor a 6%, es un falso positivo corporativo y se limita a crisis bancaria regional).
* **Acción del Algoritmo:**
  * **Venta Fuerte / Bloqueo:** XLF (Bancos), XLRE (Bienes Raíces), SCHD (Industriales/Value). La economía real se asfixia sin crédito.
  * **Refugio:** SGOV (Efectivo/T-Bills).
  * **Excepción QQQ:** Mantener solo si el CAPE es < 39.5 y el HY Spread es bajo, ya que actúa como refugio inmune al crédito.

### 🔴 Riesgo Estructural (Mediano Plazo): "Drenaje / Segunda Derivada"
El predictor de mercados bajistas por compresión de múltiplos.
* **Condición Matemática:** `M2 YoY actual` cae un **50% o más** desde su `Pico M2 YoY (últimos 12 meses)`.
* **Acelerador:** `CAPE Shiller > 35`
* **Acción del Algoritmo:**
  * **Venta Fuerte:** QQQ / TQQQ (Activos de larga duración masacrados por la falta de liquidez y alza de tasas).
  * **Rotación a Calidad:** SCHD (Empresas de alto flujo de caja hoy) y SGOV.

### 🟢 Alta Oportunidad 1: "Gatillo de Sanación" (Rebote Economía Real)
Detecta el final de un congelamiento crediticio. La señal de compra más explosiva para sectores castigados.
* **Condición Matemática:** `M2 YoY` cruza la línea cero hacia arriba (ej. de -1% a +1%) **Y** `Segunda Derivada M2` es positiva.
* **Acción del Algoritmo:**
  * **Compra Agresiva (Puntaje 100):** XLRE y XLF (Cierre masivo de cortos al volver el crédito).
  * **Fuerte Acumulación (Puntaje 90):** SCHD.
  * **Mantener (Puntaje 50):** QQQ. El capital rota hacia otros sectores.

### 🟢 Alta Oportunidad 2: "El Bazuca con Transmisión" (Hiper-Liquidez)
Detecta cuando la FED inyecta dinero agresivamente y los bancos sí lo prestan a la economía.
* **Condición Matemática:** `Delta M0 (3 meses) > +5%` **Y** `M2 YoY > +8%` (y acelerando).
* **Acción del Algoritmo:**
  * **Compra Máxima / Risk-On (Puntaje 100):** TQQQ / QQQ. Los activos de crecimiento absorben la nueva liquidez, ignorando el CAPE Shiller.
  * **Compra Fuerte (Puntaje 85):** VOO.
  * **Rezagados (Puntaje 40):** SCHD y XLRE. El mercado prefiere riesgo puro.

### 🟡 Zona Neutral: "Ricitos de Oro (Goldilocks)"
Crecimiento orgánico sin estrés sistémico.
* **Condición Matemática:** `M2 YoY` entre **+4% y +6%** con un `M0 estable`.
* **Acción del Algoritmo:** La liquidez pasa a segundo plano. Las decisiones se delegan 100% al **CAPE Shiller** y los umbrales de valuación de cada ETF.

---

## 2. Módulo de Inflación (Petróleo WTI)

*El "Asesino de Mercados" y el radar exógeno de tasas de interés.*

### 🔴 Riesgo Asesino: Shock Inflacionario
Garantiza que la FED subirá (o mantendrá altas) las tasas de interés, destruyendo múltiplos.
* **Condición Matemática:** `WTI YoY > +60%` **O** `Delta 3-Meses > +35%` (ej. salto brusco de $75 a $105).
* **Acción del Algoritmo:**
  * **Venta:** QQQ / TQQQ (Colapso del valor presente) y XLRE (Asfixia hipotecaria).
  * **Refugio:** SCHD (Cobertura energética e industrial) y SGOV.

### 🟢 Oportunidad Extrema: Alivio Deflacionario
Recorte de impuestos corporativo y de consumo.
* **Condición Matemática:** `WTI YoY < -30%`.
* **Acción del Algoritmo:**
  * **Compra Agresiva:** QQQ, VOO y XLRE. Entorno perfecto para activos de crecimiento y tasas a la baja.

### 🟡 Zona de Ruido: Estabilidad Energética
* **Condición Matemática:** `WTI YoY` entre **-20% y +15%**.
* **Acción del Algoritmo:** Ignorar el petróleo. Depender del CAPE y M2.

---

## 4. Mapeo al Semáforo BHT (adoptado 2026-11-11)

El YoY genera falsos shocks por efecto-base (rebote desde crash: mar-2021 +189% con WTI $59).
Se usa el **ratio WTI / SMA36M** (misma convención que `capeRatio`), calculado con 36 anclas
mensuales (última obs ≤ día 1 de cada mes; fail closed con <30 anclas).

| Banda | Ratio | Bonus semáforo |
| :--- | :--- | :--- |
| Alivio extremo | < 0.70 | −10 |
| Barato | 0.70 – 0.90 | −5 |
| Neutral | 0.90 – 1.20 | 0 |
| Caro | 1.20 – 1.45 | +5 |
| Shock alto | ≥ 1.45 | +10 |

* **Guarda anti-spike:** el +10 exige mes previo ya caro (ratio ≥ 1.20); si no, se topa a +5.
  Históricamente no cambia nada (los 7 shocks de 1 mes llegaban con previo ≥ 1.27).
* **Tipo:** bonus simétrico fuera del promedio (igual que HY/LIQ), con piso 0 y tope 100.
* Validación 2003–2026: SPX +1Y prom por banda −2.0% / +1.9% / +13.8% / +18.9% / +17.0%
  (shock / caro / neutral / barato / alivio). Mejor caso: GFC (shock en el pico oct-2007,
  alivio −10 en el piso mar-2009).

---

## 3. Matriz de Ejecución Rápida

| Escenario Detectado | M2 YoY / Delta | WTI Petróleo / M0 | Acción Principal del Algoritmo |
| :--- | :--- | :--- | :--- |
| **Colapso Liquidez** | Caída > 50% desde pico | - | Vender QQQ/XLRE. Comprar SCHD. |
| **Cruce de la Muerte**| Negativo (< 0%) | M0 Delta > +5% | Vender XLF/XLRE. Comprar SGOV. |
| **Shock Petróleo** | - | WTI Delta > +35% | Vender QQQ/VOO. Comprar SCHD. |
| **Gatillo Sanación** | Vuelve a positivo | - | Comprar fuerte XLRE, XLF, SCHD. |
| **Hiper-Liquidez** | > +8% y subiendo | M0 Delta > +5% | Compra máxima Risk-On TQQQ/QQQ. |
| **Goldilocks (Sano)** | Estable (4% a 6%) | Ruido (Estable) | Depende 100% del CAPE Shiller. |