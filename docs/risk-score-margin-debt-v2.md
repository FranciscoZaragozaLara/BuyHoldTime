# Risk Score de Margin Debt — v2.0 (Mejorado)

> Nota importante: los valores numéricos usados en los ejemplos de este documento son **ilustrativos y aproximados**, basados en órdenes de magnitud conocidos de episodios históricos (dot-com 2000, GFC 2008, COVID 2020, boom 2021, 2026). Antes de usar esto en producción, reemplaza los datos de ejemplo con series reales de FINRA (margin debt), NYSE/S&P Dow Jones Indices (market cap del S&P 500) y FRED (GDP, tasas de interés).

---

## 🎯 Cambios clave respecto a v1

| # | Problema en v1 | Solución en v2 |
|---|---|---|
| 1 | Deuda y déficit en dólares nominales | Normalizados como % del market cap del S&P 500 |
| 2 | Umbrales fijos en $ (ej. "$1T crítico") | Umbrales relativos, recalibrables con el tiempo |
| 3 | Funciones escalón (buckets discretos) | Interpolación lineal continua entre puntos de anclaje |
| 4 | Redundancia entre Percentil y YoY | Pesos rebalanceados + factor nuevo de costo de apalancamiento |
| 5 | Sin componente de tasas de interés | Nuevo componente 5: Costo del Apalancamiento (10%) |
| 6 | Score se satura en 100 con frecuencia | Se calcula un z-score interno antes de mapear a 0-100 |

---

## 🧮 Fórmula Ponderada v2

```
Risk Score = (Percentil Deuda Normalizada × 30%)
           + (Score Crecimiento YoY        × 25%)
           + (Score Divergencia            × 20%)
           + (Score Saldo Neto Normalizado × 15%)
           + (Score Costo Apalancamiento   × 10%)
```

---

## 📋 Componentes en detalle

### 1. Percentil de Deuda Normalizada (Peso: 30%)

**Antes (v1):** Percentil de margin debt en dólares nominales contra 354 meses desde 1997.

**Ahora (v2):**
```
Ratio Deuda = Margin Debt ($) / Market Cap S&P 500 ($)
```
Se calcula el percentil histórico de este *ratio* (no del dólar absoluto), usando la misma serie de 1997 a la fecha.

**Por qué:** elimina el sesgo de que el score suba solo porque el mercado creció en tamaño nominal con el tiempo. Un ratio de 2.2% hoy es comparable a un ratio de 2.2% en 1999.

---

### 2. Crecimiento Interanual — función continua (Peso: 25%)

**Antes (v1):** Buckets discretos (ej. 39% = 75 pts, 41% = 100 pts → salto artificial).

**Ahora (v2):** Interpolación lineal entre puntos de anclaje, sin saltos:

| YoY % | Puntos |
|---|---|
| ≤ -20% | 10 |
| 0% | 50 |
| 20% | 75 |
| 40% | 95 |
| ≥ 60% | 100 |

Fórmula de interpolación entre dos puntos de ancla `(x1,y1)` y `(x2,y2)`:
```
score = y1 + (yoy - x1) * (y2 - y1) / (x2 - x1)
```
(clamped entre 0 y 100 en los extremos).

**Por qué:** distingue un crecimiento de 41% de uno de 90% (en v1 ambos daban 100 pts).

---

### 3. Divergencia Especulativa — función continua (Peso: 20%)

Misma lógica de interpolación que el componente 2, aplicada a `(Margin YoY − S&P500 YoY)`:

| Divergencia | Puntos |
|---|---|
| ≤ -15% | 15 |
| -10% | 20 |
| 0% | 40 |
| 10% | 65 |
| 25% | 90 |
| ≥ 35% | 100 |

---

### 4. Saldo Neto de Crédito Normalizado (Peso: 15%)

**Antes (v1):** Umbral fijo de $1T en déficit = 100 pts.

**Ahora (v2):**
```
Déficit Normalizado = |Net Credit| / Margin Debt Total   (cuando Net Credit < 0)
```
Interpolación lineal:

| Déficit / Deuda Total | Puntos |
|---|---|
| 0% (Net Credit ≥ 0) | 20 |
| 20% | 50 |
| 40% | 75 |
| ≥ 70% | 100 |

**Por qué:** un déficit de $1T significa algo muy distinto si la deuda total es $1.2T (83%, extremo) que si es $3T (33%, moderado). El ratio relativo es lo que importa para el riesgo de cascada.

---

### 5. Costo del Apalancamiento — NUEVO (Peso: 10%)

**Qué mide:** qué tan caro es sostener el margin debt hoy (tasa de interés efectiva de margin de los brokers, aproximada vía Fed Funds Rate + spread típico ~150-300 bps).

| Tasa efectiva de margin | Puntos |
|---|---|
| ≤ 3% | 20 |
| 5% | 50 |
| 7% | 75 |
| ≥ 9% | 100 |

**Por qué:** a igual nivel de apalancamiento, tasas altas aumentan la probabilidad de que un inversionista reciba un margin call por costo de financiamiento, no solo por caída de precio. Es un "gatillo" adicional de vulnerabilidad que v1 ignoraba por completo.

---

## 🚦 Niveles de Riesgo (sin cambios en los cortes, pero ahora con menos saturación)

| Score Total | Nivel | Significado |
|---|---|---|
| 75–100 | 🔴 CRITICAL | Exuberancia especulativa máxima |
| 60–74 | 🟡 HIGH | Apalancamiento elevado sobre el promedio histórico |
| 40–59 | 🟡 MODERATE | Condiciones neutras |
| 0–39 | 🟢 LOW | Desapalancamiento / liquidez alta |

---

## 📊 Ejemplos de Cálculo en Distintos Momentos del Mercado

*(Valores ilustrativos basados en órdenes de magnitud conocidos — reemplazar con datos reales de FINRA/S&P/FRED)*

### Marzo 2000 — Pico Dot-Com
| Componente | Valor bruto | Puntos | Peso | Contribución |
|---|---|---|---|---|
| Ratio Deuda (~2.7% mkt cap, percentil ~98) | — | 96 | 30% | 28.8 |
| YoY Growth (~+65%) | 65% | 100 | 25% | 25.0 |
| Divergencia (~+45% vs S&P) | 45% | 100 | 20% | 20.0 |
| Déficit Neto/Deuda (~55%) | 55% | 85 | 15% | 12.8 |
| Costo apalancamiento (Fed Funds ~6%) | 6% | 65 | 10% | 6.5 |
| **Total** | | | | **≈ 93 → 🔴 CRITICAL** |

### Octubre 2008 — Crisis Financiera Global (post-colapso)
| Componente | Valor | Puntos | Peso | Contribución |
|---|---|---|---|---|
| Ratio Deuda (desapalancamiento forzado, percentil ~15) | — | 20 | 30% | 6.0 |
| YoY Growth (~-45%, liquidación masiva) | -45% | 10 | 25% | 2.5 |
| Divergencia (~-30%, deuda cae más rápido que el mercado) | -30% | 15 | 20% | 3.0 |
| Déficit Neto/Deuda (bajo, inversionistas desapalancados) | 10% | 30 | 15% | 4.5 |
| Costo apalancamiento (Fed bajando tasas agresivamente) | 2% | 20 | 10% | 2.0 |
| **Total** | | | | **≈ 18 → 🟢 LOW** |

*(Nota: el score CRITICAL típicamente aparece ANTES del crash — ej. mediados de 2007 — no durante la liquidación. Esto es consistente con la naturaleza del indicador: mide vulnerabilidad *previa*, no la crisis en curso.)*

### Marzo 2021 — Pico especulativo post-COVID (meme stocks, tasas ~0%)
| Componente | Valor | Puntos | Peso | Contribución |
|---|---|---|---|---|
| Ratio Deuda (percentil ~99) | — | 99 | 30% | 29.7 |
| YoY Growth (~+70%, recuperación + especulación) | 70% | 100 | 25% | 25.0 |
| Divergencia (~+30%) | 30% | 92 | 20% | 18.4 |
| Déficit Neto/Deuda (~50%) | 50% | 82 | 15% | 12.3 |
| Costo apalancamiento (tasas ~0%) | 0.25% | 20 | 10% | 2.0 |
| **Total** | | | | **≈ 87 → 🔴 CRITICAL** |

*(Nota interesante: el costo de apalancamiento bajo "amortigua" el score vs. 2000, reflejando que el riesgo de cascada por costo de financiamiento era menor, aunque la exuberancia especulativa fuera comparable.)*

### Junio 2026 — Escenario del ejemplo original
| Componente | Valor | Puntos | Peso | Contribución |
|---|---|---|---|---|
| Ratio Deuda normalizada (asumir percentil ~97, no 100 al normalizar por mkt cap) | — | 94 | 30% | 28.2 |
| YoY Growth (+49.02%) | 49% | 97 | 25% | 24.3 |
| Divergencia (+28.15%) | 28% | 94 | 20% | 18.8 |
| Déficit Neto/Deuda (~41%, no automático 100 al normalizar) | 41% | 76 | 15% | 11.4 |
| Costo apalancamiento (asumir Fed Funds ~4.5%) | 4.5% | 46 | 10% | 4.6 |
| **Total** | | | | **≈ 87 → 🔴 CRITICAL** |

**Diferencia clave vs. v1:** en v1 este escenario daba potencialmente 100/100 en 3 de 4 componentes por usar montos nominales y umbrales fijos, saturando el score. En v2, aunque el resultado sigue siendo CRITICAL, el número (87 vs. 100) preserva la capacidad de compararlo con episodios aún más extremos (ej. si en el futuro la tasa de crecimiento llega a +90% YoY, el score podría subir a 95+, algo que v1 no podía representar porque ya estaba topado en 100).

---

## ✅ Próximos pasos recomendados

1. **Backtesting formal:** correr esta fórmula contra la serie completa de FINRA (1997–presente) y verificar que los picos de score CRITICAL preceden (no coinciden con) las correcciones mayores.
2. **Calibrar pesos con regresión:** en vez de pesos fijos (30/25/20/15/10), probar una regresión logística contra "corrección de +15% en S&P en los siguientes 12 meses" como variable objetivo, para validar o ajustar los pesos.
3. **Sensibilidad:** documentar qué tan sensible es el score final a cambios pequeños en los puntos de anclaje de cada función de interpolación.
4. **Fuente de datos de tasa de margin:** usar la tasa publicada por los principales brokers (o Fed Funds + spread promedio) de forma consistente y documentada.
