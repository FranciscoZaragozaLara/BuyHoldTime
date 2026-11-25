# BuyHoldTime · Módulo de Reentrada por Tranches (MRT)

**Complemento del termómetro "Triple Llave" (CAPE + Margin Z-Score + HY OAS)**
Versión 1.3 · 20 de noviembre de 2026

**Cambios en la versión 1.3:**

- **Nuevo tranche T0 de capitulación:** compra *durante* el pánico en desplomes rápidos. La escalera pasa de 4 a 5 tranches con nuevos pesos.
- **Corrección 1:** el voto de volatilidad se anula si el ratio VIX/VIX3M vuelve a pasar de 1.
- **Corrección 2:** la profundidad exigida a T2 y T4 se mide como caída **alcanzada durante el episodio**, no como caída vigente.
- **Nueva sección 10:** validación con datos reales de la crisis de aranceles de 2025.

---

## 1. Propósito

La Triple Llave ya resuelve bien cuándo **salir** (Motor A de burbuja de valuación, Motor B de crisis de liquidez, gatillos G1 y G2). Le falta precisión del lado de la **compra**: cuándo deja de caer el cuchillo.

El CAPE responde *dónde* está la zona barata, pero no *cuándo* comprar. Este módulo agrega la **segunda derivada del miedo**: señales de que el estrés sigue alto pero ya está cediendo.

**Principio rector:** hay dos tipos de caída y cada uno pide una conducta distinta.

| | Desplome rápido (capitulación) | Mercado bajista lento |
|---|---|---|
| Ejemplos | 1987, dic 2018, 2020, ago 2024, abr 2025 | 2000–02, 2008, 2022 |
| Velocidad | ≥10% en 10 días hábiles | Meses de caída gradual |
| Crédito | Los spreads suben, pero lejos de crisis sistémica | Spreads en zona de crisis o subiendo durante meses |
| Fondo | En el **pico del pánico** | Después de varios rebotes falsos |
| Conducta | **Comprar durante el pánico** (T0) | Esperar confirmación (T1–T4) |

---

## 2. Arquitectura en capas

| Capa | Función | Indicador |
|---|---|---|
| Permiso dual | ¿Hay una caída relevante? | Caída del CAPE del S&P vs su máximo de 12 meses **o** caída del Nasdaq-100 vs su máximo de 12 meses |
| Capitulación (T0) | ¿Es un desplome rápido con pánico extremo? | Profundidad + velocidad + VIX/VIX3M > 1.20 + crédito fuera de zona sistémica |
| Veto (T1–T4) | ¿El crédito sigue rompiéndose? | HY OAS en máximos de 63 días y sobre su SMA20 |
| Voto 1: volatilidad | ¿Terminó el pánico agudo? | VIX/VIX3M regresa debajo de 1 tras pasar de 1.05; **se anula si vuelve a pasar de 1** (VXN en la ruta del Nasdaq) |
| Voto 2: desaceleración | ¿El cuchillo pierde velocidad? | Curvatura de la EMA50 con filtro de magnitud, o reingreso a la banda de Bollinger de −2σ |
| Voto 3: amplitud (opcional) | ¿El resto del mercado dejó de caer? | % de acciones sobre su SMA50: lavado (<15%) y luego confirmación (>50%) |
| Valuación profunda | ¿Es una oportunidad histórica? | ECY por encima de su mediana de 20 años (o CAPE por debajo de su mediana de 20 años) |

**Por qué votos y no condiciones obligatorias simultáneas:** exigir que todo se alinee hace que el modelo dispare tarde o nunca. También lo sobreajusta, porque la muestra solo tiene 5 o 6 mercados bajistas.

---

## 3. Valuación: por qué un CAPE relativo

- El CAPE está estructuralmente más alto desde los años 90 por recompras, intangibles, cambios contables y tasas bajas. Con umbrales absolutos, el modelo se habría quedado fuera en 2020, 2022 y 2025.
- En el corto plazo, la caída del CAPE casi equivale a la caída del S&P 500, porque el E10 se mueve muy lento. Por eso los tranches T0–T3 usan la caída relativa como **permiso**, y el T4 usa el **nivel** (ECY o percentil) como medida de valor real.
- **Excess CAPE Yield** = 1/CAPE − tasa real a 10 años. Ajusta la valuación por tasas. Shiller lo publica con historia desde 1881.
- **CAPE diario sin look-ahead:** se calcula k = CAPE mensual ÷ precio medio del S&P en ese mes, con un mes de rezago, y se aplica al precio diario: CAPE_d = k × S&P_t.
- **Limitación:** es el CAPE del S&P 500, que funciona como proxy para QQQ y Nasdaq-100.

### 3.1 Permiso dual: S&P 500 o Nasdaq-100

**El problema:** en noviembre de 2026, QQQ cayó ~15% mientras el S&P solo cayó ~6%. Un permiso basado únicamente en el CAPE del S&P se queda ciego en las correcciones concentradas en tecnología.

**La solución:** el permiso se activa si se cumple **cualquiera** de las dos rutas. Los umbrales del Nasdaq-100 se escalan por su volatilidad relativa (~1.4–1.5 veces la del S&P):

| Tranche | Ruta S&P (caída del CAPE) | Ruta Nasdaq-100 (caída del precio) |
|---|---|---|
| T0 | −15% | −20% |
| T1 | −10% | −15% |
| T2 | −15% alcanzado | −22% alcanzado |
| T4 | −25% alcanzado | −35% alcanzado |

**Aclaración conceptual:** es una **caída dual**, no una valuación dual. Las dos rutas dicen "más barato que antes", no "barato". El ancla de valuación absoluta sigue siendo el **nivel** del ECY o del CAPE en el T4, y se exige en ambas rutas.

**Reglas de la ruta Nasdaq:**

1. **Si solo cae el Nasdaq y el S&P no confirma** (corrección sectorial), el T1 exige el voto de volatilidad **más** otro voto, o se ejecuta a la mitad de su tamaño. Las dos opciones se prueban en el backtest.
2. **El voto de volatilidad usa el VXN** (FRED VXNCLS, desde 2001) en lugar del VIX.
3. **El veto de crédito aplica igual en las dos rutas.** Es lo que evita comprar en caídas como 2000–02.
4. **Para medir el episodio** se toma la ruta que se activó primero. El episodio termina cuando las dos rutas regresan a sus máximos de 12 meses (o QQQ recupera su máximo previo).

**Riesgo:** con la lógica "o" hay más señales y más falsas. El backtest debe comparar tres variantes (solo S&P, solo Nasdaq y ambas).

---

## 4. Curvatura de la EMA50: definición robusta

La curvatura diaria es casi puro ruido. Por la forma en que se actualiza la EMA:

> Δ²EMA_t = α · (ΔPrecio_t − ΔEMA_{t−1})

En plena caída, **cualquier día verde vuelve positiva la curvatura**. Por eso se mide en ventanas y en porcentaje:

- **Pendiente:** S_t = EMA50_t / EMA50_{t−10} − 1
- **Curvatura:** C_t = S_t − S_{t−5}
- **Voto de desaceleración**, que exige las cuatro condiciones:
  - C > 0 durante 3 días consecutivos
  - el mínimo reciente de S fue ≤ −1.5% (hubo un cuchillo real)
  - S ya recuperó al menos 50% desde su mínimo (filtro de magnitud; probar también 30%)
  - S sigue negativa (fase de aplanamiento, antes del cruce)
  - **Ajuste de la app (nov-2026):** cuando S cruza a positiva, el voto sigue valiendo **10 sesiones** más. Sin esa gracia, si el voto de volatilidad llegaba después del cruce, T2 quedaba bloqueado (y T3, que exige T2): pasó en VOO 1990 (T2 a +12.4% del mínimo en vez de +7.3%) y 2022 (T2 en mar-2023 en vez de nov-2022). Estudio: `apps/backend/prisma/decel-grace-study.ts`.

**Regla práctica:** S ≈ 0.39 × (distancia promedio del precio a la EMA en los últimos 10 días). Si el precio se estabiliza, esa distancia se reduce a la mitad cada ~17 días hábiles. Por eso el voto tarda 4–6 semanas con precio plano y 2–3 semanas con un rebote moderado.

**Nota:** el vértice de la "U" de la EMA (pendiente = 0) coincide matemáticamente con el cruce del precio sobre la EMA. La ventaja real se obtiene durante el **aplanamiento**, no en el vértice.

---

## 5. Los 5 tranches

| Tranche | Peso | Mezcla QQQ / TQQQ | Condición principal | Respaldo |
|---|---|---|---|---|
| **T0 · Capitulación** | 25% | 100% / 0% | Ver sección 5.1. Compra **durante** el pánico | — |
| **T1 · Pánico terminando** | 15% | 100% / 0% | Permiso (CAPE −10% **o** NDX −15%) + sin veto + voto de volatilidad. Si solo entra por la ruta del NDX: + otro voto, o medio tamaño | — |
| **T2 · Desaceleración confirmada** | 25% | 70% / 30% | Caída **alcanzada** en el episodio de CAPE −15% **o** NDX −22% + sin veto + 2 votos (≥5 días después de T1) | — |
| **T3 · Validación** | 20% | 40% / 60% | Retest del mínimo (≤3% arriba, tras un rebote ≥8%) con votos activos (≥10 días después de T2) | 3 cierres sobre la EMA50 ascendente |
| **T4 · Reserva de valuación profunda** | 15% | 0% / 100% | Caída **alcanzada** de CAPE −25% **o** NDX −35%, **siempre** con valuación profunda (ECY) + HY OAS ≥15% debajo de su máximo de 12 meses + 1 voto | Si a los 12 meses no se activó y el precio está sobre la EMA200, entra en QQQ |

### 5.1 T0 · Tranche de capitulación

Se dispara **una sola vez por episodio**, el primer día en que se cumplen las cuatro condiciones:

1. **Profundidad:** S&P ≥15% debajo de su máximo **o** Nasdaq-100 ≥20% debajo del suyo.
2. **Velocidad:** S&P −10% o más en los últimos 10 días hábiles **o** Nasdaq-100 −13% o más.
3. **Pánico extremo:** VIX/VIX3M arriba de 1.20 al cierre (VXN en la ruta del Nasdaq).
4. **Crédito fuera de zona sistémica:** HY OAS debajo de ~6% (umbral a calibrar entre 5% y 7%). Sustituye al veto normal, porque en un pánico el OAS siempre sube y el veto bloquearía todo.

**Diseño defensivo:**

- **100% QQQ, sin apalancamiento.** Si el desplome se convierte en un 2008, el T0 no destruye el bloque.
- **No depende de los votos ni de los demás tranches.** T1–T4 siguen su lógica normal.
- **Si el T0 se disparó**, el T1 puede exigir un voto adicional para no duplicar la compra en el mismo pánico (variante a probar).

**Cómo debería filtrar los episodios conocidos** (hay que confirmarlo en el backtest):

| Episodio | ¿Dispara el T0? | Motivo |
|---|---|---|
| Abril 2025 | ✅ 4 de abril | −17.4%, −10.5% en 10 días, ratio 1.23, OAS 4.45% |
| Agosto 2024 | ❌ | Ratio extremo, pero la caída fue de solo ~8% |
| 2022 | ❌ | No hubo pánico extremo: el ratio casi nunca pasó de 1.2 |
| 2008 | ❌ (esperado) | El OAS ya estaba en zona de crisis antes de los desplomes de octubre |
| Marzo 2020 | ⚠️ Dudoso | El OAS subió rápido hacia ~10%; el umbral decide si entra |

### 5.2 Apalancamiento escalonado

Lo que importa es el **apalancamiento efectivo del bloque** después de cada tranche, y debe subir al ritmo de la confirmación:

| Después de | Apalancamiento acumulado |
|---|---|
| T0 | 0.25x |
| T1 | 0.40x |
| T2 | 0.80x |
| T3 | 1.24x |
| T4 | **1.69x** |

- **Las compras durante el pánico (T0 y T1) van sin apalancamiento.** Cerca del fondo, el mercado va de lado con mucha volatilidad y eso decae al 3x.
- **El 3x se concentra en la recuperación con tendencia** (T3 y T4), donde TQQQ puede rendir más de 3x.
- **Apalancamiento final:** ~1.7x del bloque. Ajusta la escalera al apalancamiento objetivo de tu estrategia base.

**Implementación en IBKR:** cada tranche se ejecuta como dos órdenes (QQQ y TQQQ) por los porcentajes de la mezcla.

### 5.3 Reglas de episodio

- **Inicio:** el primer día con permiso (CAPE −10% o NDX −15%).
- **Fin:** QQQ recupera su máximo previo, o las dos rutas regresan a máximos de 12 meses. Esta segunda regla separa 2000–02 de 2008.
- **Caída alcanzada:** la máxima caída registrada desde el inicio del episodio. Se usa en T2 y T4 (corrección 2).

---

## 6. Integración con la Triple Llave

| Elemento actual | Relación con el MRT |
|---|---|
| Motor A / Motor B, G1, G2 | Sin cambios: siguen gobernando la venta |
| Régimen "Capitulación" | Lo materializa el **T0** |
| G3 (recompra del 30%) | Lo enriquecen T1+T2 |
| G4 (recompra del 100%) | Lo enriquecen T3+T4 |
| Regla de G3 "HY OAS ≥25% desde su máximo de 12 meses" | Equivale al filtro de T4 (aquí con 15% por defecto). Probar 15%, 20% y 25% |
| Timeout de 12 meses de G2 | Equivale al respaldo de T4 |

**Dos formas de usarlo:**

1. **Dependiente de estado:** el MRT solo se evalúa después de G2, igual que G3 y G4 hoy.
2. **Independiente:** el MRT despliega efectivo nuevo de reserva en cualquier corrección, aunque no se haya vendido antes.

---

## 7. Semáforo para la app BuyHoldTime

El motor genera `estado_actual.json`, que el backend de NestJS puede exponer directamente:

| Color | Condición | Mensaje sugerido |
|---|---|---|
| GRIS | Sin permiso ni episodio abierto | "Sin corrección relevante" |
| MORADO | Condiciones del T0 activas | "Capitulación: pánico extremo en un desplome rápido" |
| ROJO | Veto de crédito activo | "El cuchillo sigue cayendo: crédito en máximos" |
| ÁMBAR | Permiso, 0 votos | "Caída relevante, sin señales de suelo todavía" |
| VERDE | Permiso + ≥1 voto, sin veto | "Señales de suelo activas (n votos)" |

**Ideas para el SaaS:** alertas por WhatsApp cuando cambie de color o se dispare un tranche (sobre todo el MORADO, que dura pocos días), y un historial de tranches por episodio como contenido del blog y del boletín.

---

## 8. Datos necesarios

| Archivo | Fuente | Serie | Historia |
|---|---|---|---|
| qqq.csv | Yahoo Finance | QQQ (Adj Close) | 1999 |
| spx.csv | Yahoo Finance / FRED | ^GSPC / SP500 | 1950+ |
| ndx.csv | Yahoo Finance / FRED | ^NDX / NASDAQ100 | 1985 |
| cape.csv | Shiller (ie_data.xls) | Date, CAPE, ECY (mensual) | 1881 |
| hy_oas.csv | FRED | BAMLH0A0HYM2 | ~1997 |
| vix.csv | CBOE / FRED | VIX_History / VIXCLS | 1990 |
| vix3m.csv | CBOE | VIX3M_History | ~2007 |
| vxn.csv | CBOE / FRED | VXNCLS | 2001 |
| tqqq.csv *(opc.)* | Yahoo Finance | TQQQ | 2010 (antes se usa sintético) |
| rf.csv *(opc.)* | FRED | DGS3MO | 1981 |
| breadth.csv *(opc.)* | StockCharts u otro | % sobre SMA50 ($SPXA50R) | varía |

**Antes de 2007 no hay VIX3M.** El T0 y el voto de volatilidad usan un respaldo: VIX arriba de 35 y ≥50% arriba de su promedio de 20 días para el T0, y VIX 25% debajo de su máximo de 10 días para el voto.

**TQQQ sintético antes de 2010:** r_TQQQ = 3·r_QQQ − (0.95% + 2·rf)/252. Es una cota optimista.

---

## 9. Metodología del backtest

Cada episodio se evalúa con un **bloque de $1 de efectivo** a un horizonte de 3 años desde el inicio del episodio. El efectivo no desplegado rinde la tasa libre de riesgo. Los comparadores usan **la misma mezcla total de instrumentos** que el módulo (~65% QQQ / 35% TQQQ), así que solo cambia el *timing*.

1. **Módulo MRT:** los 5 tranches.
2. **Módulo sin T0:** para medir cuánto aporta la capitulación.
3. **Todo al inicio:** comprar todo con el permiso.
4. **Todo al cruce de la EMA50:** precio cruza sobre la EMA50 con pendiente positiva.
5. **DCA de 12 meses:** 12 compras mensuales iguales.
6. **Referencia:** buy & hold de 100% QQQ.

**Pruebas adicionales:** permiso en tres variantes (solo S&P, solo Nasdaq y dual); umbral de OAS del T0 en 5%, 6% y 7%; filtro de recuperación de la curvatura en 30% y 50%.

**Métricas por episodio:** valor final, % desplegado, precio promedio de entrada, **% de la caída capturada** (puntos entre el pico y el precio promedio ÷ puntos entre el pico y el fondo) y drawdown máximo del bloque.

**Episodios clave:** 2000–02, 2008–09, 2011, 2015–16, 2018, 2020, 2022, 2024, 2025 y la corrección actual de 2026.

---

## 10. Validación: crisis de aranceles de 2025

Simulación con datos diarios reales: S&P 500, Nasdaq-100 y HY OAS de FRED; VIX y VIX3M de CBOE. La caída del S&P se usa en lugar de la del CAPE (en dos meses casi coinciden).

**Fechas clave** (% respecto al pico / % respecto al fondo)

| Fecha | Evento | S&P 500 | Nasdaq-100 |
|---|---|---|---|
| 19 feb | **Pico del mercado** | 6,144 (0% / +23.3%) | 22,176 (0% / +29.8%) |
| 3 mar | Inicia backwardation, ola 1 (ratio 1.03) | 5,850 (−4.8% / +17.4%) | −7.9% / +19.5% |
| 10 mar | Pico de la ola 1 (ratio 1.08, VIX 27.9) | 5,615 (−8.6% / +12.7%) | −12.4% / +13.7% |
| 13 mar | Permiso del −10%, bloqueado por veto de crédito ✅ | 5,522 (−10.1% / +10.8%) | −13.3% / +12.5% |
| 14 mar | Se apaga la ola 1 (ratio 0.98) | 5,639 (−8.2% / +13.2%) | −11.1% / +15.3% |
| 2 abr | Inicia la ola 2 (ratio 1.00) | 5,671 (−7.7% / +13.8%) | −11.7% / +14.6% |
| **4 abr** | **T0 · capitulación** (ratio 1.23, OAS 4.45%) | **5,074 (−17.4% / +1.8%)** | −21.5% / +1.8% |
| 7 abr | Pico del backwardation (ratio 1.27, VIX intradía 60) | 5,062 (−17.6% / +1.6%) | −21.4% / +2.0% |
| 8 abr | **Fondo del mercado** (VIX al cierre 52.3) | 4,983 (−18.9% / 0%) | 17,090 (−22.9% / 0%) |
| 9 abr | Pausa de 90 días. *La v1.2 habría disparado un T1 falso aquí* | 5,457 (−11.2% / +9.5%) | −13.7% / +12.0% |
| **25 abr** | **T1** · se apaga el backwardation (ratio 0.98) | **5,525 (−10.1% / +10.9%)** | −12.4% / +13.7% |
| **2 may** | **T2** · caída alcanzada −18.9% + 2 votos | **5,687 (−7.4% / +14.1%)** | −9.3% / +17.6% |
| **16 may** | **T3** · respaldo: 3 cierres sobre la EMA50 | **5,958 (−3.0% / +19.6%)** | −3.4% / +25.4% |
| — | **T4 no se activa** (caída máxima de −18.9% y −22.9%) | — | — |
| 27 jun | Nuevo máximo del S&P | 6,173 | — |

**Resultado (85% del bloque desplegado)**

| Versión | Precio promedio del S&P | vs pico | vs fondo | % de la caída capturada |
|---|---|---|---|---|
| v1.2 corregida, sin T0 | ~5,734 | −6.7% | +15.1% | ~35% |
| **v1.3 con T0** | **~5,542** | **−9.8%** | **+11.2%** | **~52%** |

**Hallazgos que motivaron los cambios:**

1. **Voto residual:** la persistencia de 10 días mantuvo vivo el voto de marzo y disparó un T1 el 9 de abril con el ratio en 1.12, en pleno backwardation. → Corrección 1.
2. **Profundidad perdida:** cuando aparecieron los 2 votos, el mercado ya había rebotado a −7%. Con la regla de caída vigente, el T2 y el T3 nunca se habrían disparado. → Corrección 2.
3. **Entrada tardía en desplomes en V:** sin T0, el módulo entraba ~11% arriba del fondo, prácticamente empatado con comprar al cruce de la EMA50. → Nuevo T0.
4. **El veto funcionó:** bloqueó la entrada del 13 de marzo, antes de otra caída de ~10%.

---

## 11. Riesgos y cuidados

- **Sobreajuste:** el T0 se diseñó después de ver 2025. Su validación real son los demás episodios (1987 con respaldo de VIX, 2018, 2020, 2022, 2024). Si solo funciona en 2025, se descarta.
- **Umbrales:** todos son puntos de partida. Prueba valores vecinos; si el resultado solo funciona con una combinación exacta, está sobreajustado.
- **Look-ahead:** el CAPE usa un mes de rezago, todas las señales se calculan al cierre y la orden se ejecuta con ese cierre. Para mayor realismo, desplaza la ejecución al día siguiente. El T0 es el más sensible a esto, porque los días de pánico tienen gaps grandes.
- **Datos de cierre, no intradía:** el 7 de abril de 2025 el VIX abrió en 60 y cerró en 47. Las señales usan cierres.
- **Amplitud:** si se reconstruye con los componentes actuales del índice, el sesgo de supervivencia infla los resultados.
- **Invalidación:** si el precio marca un nuevo mínimo después de T0, T1 o T2, las posiciones se mantienen (la tesis es de valuación) y los tranches restantes siguen esperando sus señales.

---

## 12. Lectura al 19 de noviembre de 2026

- QQQ cerca de $645, ~15% abajo de su máximo de octubre (~$760), debajo de la EMA50 (~700) y de la EMA200 (~683).
- **T0: ❌.** El S&P está en ~−6% y el Nasdaq-100 en ~−15%, sin llegar a la profundidad del T0 (−15% / −20%).
- **T1, ruta S&P: ❌.** Récord de 7,818.93 el 6 de octubre y cierre de 7,340.53 el 17 de noviembre (~−6%). El gatillo de −10% equivale a un S&P de ~7,050–7,100.
- **T1, ruta Nasdaq-100: ✅ permiso activo.** Como el S&P no confirma, es una corrección sectorial: aplica la regla de un voto extra o medio tamaño.
- **Veto de crédito: ⚠️ cerca del límite.** HY OAS general en ~3.23% (13 de noviembre), +19% en tres meses; el estrés se concentra en los CCC.
- **Voto de volatilidad: ✅ probable.** El VIX saltó a 28.18 el 5 de noviembre y regresó a 19.30 el 13; la ventana de 20 días vence a inicios de diciembre. Con la corrección 1, el voto se anula si el ratio vuelve a pasar de 1.
- **Voto de desaceleración: ❌.** La EMA50 sigue muy inclinada. Con precio plano tardaría ~27 días hábiles.

---

## 13. Archivos y pendientes del motor

- `tranches_reentrada.py`: motor v1.0 (señales, episodios, evaluación, semáforo y gráfica). Uso: `python tranches_reentrada.py --data ./data --out ./salida`
- **Pendientes para llevar el motor a v1.3:**
  1. Mezcla QQQ/TQQQ por tranche en `Config` (por ejemplo `{"T2": {"QQQ": 0.7, "TQQQ": 0.3}}`) y los nuevos pesos 25/15/25/20/15.
  2. Ruta del Nasdaq-100: cargar `ndx.csv` y `vxn.csv`, permiso dual y regla de corrección sectorial.
  3. **T0:** profundidad, velocidad de 10 días, ratio > 1.20 y OAS < umbral sistémico, con respaldo de VIX antes de 2007.
  4. **Corrección 1:** `voto_vol = persistido & (ratio < 1)`.
  5. **Corrección 2:** usar la caída máxima del episodio en T2 y T4.
  6. Métrica de "% de la caída capturada" y comparador "módulo sin T0".
- Salidas: `senales_diarias.csv`, `tranches.csv`, `episodios.csv`, `estado_actual.json`, `config.json` y `episodios.png`.

*Este documento es metodología de investigación cuantitativa, no asesoría financiera.*
