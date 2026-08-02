# Reglas de Extracción, Agrupamiento y Cálculo de EPS (SEC EDGAR)

Documento oficial de referencia técnica y salvaguarda para el backend y frontend de **BuyHoldTime Finance**.

---

## 🛑 REGLA INVIOLABLE (CRITICAL / NON-NEGOTIABLE)

**Cualquier modificación futura a la extracción de datos de la SEC EDGAR o al cálculo de EPS debe preservar de manera obligatoria las siguientes tres invariantes:**

1. **4/4 Trimestres Únicos por Año Fiscal**: Todo año fiscal cerrado **DEBE** tener exactamente $Q1, Q2, Q3$ y $Q4$. Nunca pueden existir dos $Q1$ en el mismo año fiscal ni omitirse $Q4$.
2. **Extracción y Filtrado por Duración de Trimestre (70 a 125 días)**:
   - Los trimestres estándar constan de 12–13 semanas (83–92 días).
   - Algunas compañías (ej. **Costco Wholesale Corp `COST`**) reportan sus trimestres con duraciones atípicas: **Q1, Q2, Q3 de 12 semanas (~84 días)** y **Q4 de 16 semanas (~111-118 días)**.
   - Por ello, el filtro de días para capturar trimestres individuales abarca estrictamente:
     $$70 \le \text{Días} \le 125$$
   - Los reportes anuales $10\text{-K}$ abarcan entre 350 y 375 días.
3. **Clasificación Universal por Mes de Cierre Fiscal (`closingMonth`)**:
   - En lugar de condicionales por símbolo, el algoritmo determina la clasificación usando el mes de cierre auditado (`closingMonth`):
     - **Meses 8, 9, 10 (Agosto / Septiembre / Octubre - ej. COST, AAPL, QCOM)**:
       - Noviembre – Enero $\rightarrow$ **Q1** ($\text{Año}+1$ si Nov/Dic)
       - Febrero – Abril $\rightarrow$ **Q2** ($\text{Año}$)
       - Mayo – Julio $\rightarrow$ **Q3** ($\text{Año}$)
       - Agosto – Octubre $\rightarrow$ **Q4** ($\text{Año}$)
     - **Meses 6, 7 (Junio / Julio - ej. MSFT, CSCO, PANW)**:
       - Agosto – Octubre $\rightarrow$ **Q1** ($\text{Año}+1$)
       - Noviembre – Enero $\rightarrow$ **Q2** ($\text{Año}+1$ si Nov/Dic)
       - Febrero – Abril $\rightarrow$ **Q3** ($\text{Año}$)
       - Mayo – Julio $\rightarrow$ **Q4** ($\text{Año}$)
     - **Meses 1, 2 (Enero / Febrero - ej. NVDA, WMT, CRWD)**:
       - Marzo – Mayo $\rightarrow$ **Q1** ($\text{Año}+1$)
       - Junio – Agosto $\rightarrow$ **Q2** ($\text{Año}+1$)
       - Septiembre – Noviembre $\rightarrow$ **Q3** ($\text{Año}+1$)
       - Diciembre – Febrero $\rightarrow$ **Q4** ($\text{Año}+1$ si Diciembre)
     - **Mes 12 (Diciembre - ej. AMZN, GOOGL, META, TSLA)**:
       - $Q1$ (Ene-Mar), $Q2$ (Abr-Jun), $Q3$ (Jul-Sep), $Q4$ (Oct-Dic) del mismo año.
4. **Ordenamiento Visual Ascendente (`ASC`)**: Tanto el Popover de **EPS TTM Calendar** como el Popover de **EPS Fiscal 10-K** deben ordenarse de forma ascendente por fecha (de la fecha más antigua a la fecha más reciente).

---

## 1. Principios Fundamentales e Invariantes

Para cualquier ticker en la base de datos (ej. AAPL, AMZN, GOOGL, NVDA, MSFT), la serie histórica de trimestres (`historicalEpsQuarterly`) debe cumplir **estrictamente** con:

1. **Cobertura Completa 4/4 por Año Fiscal**:
   - Todo año fiscal finalizado (ej. 2009 hasta 2025) **debe contener exactamente 4 trimestres**: `Q1`, `Q2`, `Q3` y `Q4`.
   - **Prohibición**: No pueden existir dos trimestres del mismo tipo en el mismo año fiscal (ej. dos `Q1`), ni omitirse o saltarse ningún trimestre (ej. omitir `Q4`).

2. **Ordenamiento Cronológico Escalonado Descendente en DB y Ascendente en UI**:
   - En **Base de Datos (PostgreSQL)**: Se almacena en orden descendente por fecha (`date`).
   - En **Componentes UI (Popovers)**: Se ordenan en modo **ASCENDENTE (`ASC`)** por fecha ($Q1 \rightarrow Q2 \rightarrow Q3 \rightarrow Q4$), para una lectura cronológica natural de arriba a abajo.

---

## 2. Reglas de Filtrado y Extracción de Hechos SEC EDGAR

La SEC publica informes financieros en su API XBRL (`https://data.sec.gov/api/xbrl/companyfacts/CIK...json`). Se aplican los siguientes filtros estrictos por **duración en días**:

### A. Extracción de Trimestres de 3 Meses Puros
- **Filtro de Duración**:
  $$\text{Días} = \frac{\text{Fecha\_Fin} - \text{Fecha\_Inicio}}{86.400.000} \quad \Rightarrow \quad 75 \le \text{Días} \le 110$$
- **Sin restricción de Formulario**: Se extraen tanto de formularios `10-Q` como de desgloses de 3 meses dentro de formularios `10-K` o `10-K/A` (necesario para años antiguos como 2020/2019/2018).
- **Desduplicación por Informe Original**:
  - Si existen múltiples publicaciones para la misma fecha de cierre (`end`), se selecciona el reporte presentado con la **fecha de informe original más antigua** (`earliest filed date`), evitando hechos comparativos modificados en años posteriores con `fy` distorsionado.

### C. Fallback para Empresas de Estructura de Capital Multiclase (ej. Visa - V)
- Algunas empresas con múltiples clases de acciones (Clase A, B, C) no publican el concepto genérico `EarningsPerShareDiluted` en `us-gaap` de la SEC EDGAR.
- Para estas empresas, el sistema activa automáticamente un **Fallback de Integración Enriquecida** que consolida la serie histórica trimestral y asigna los periodos ($Q1, Q2, Q3, Q4$) respetando estrictamente su mes de cierre fiscal (`closingMonth === 9` para Visa).

---

## 3. Asignación de Periodo (Q1..Q4) y Año Fiscal (`fiscalYear`)

El mes de cierre oficial del reporte Form 10-K (`closingMonth`) se detecta automáticamente para cada empresa:

### A. Matriz de Clasificación por Mes de Cierre Fiscal

1. **Empresas con Cierre Fiscal en Junio** (`closingMonth === 6`, ej. **Microsoft - MSFT**, **LRCX**, **KLAC**):
   - **Agosto, Septiembre, Octubre** (`Mo 8..10`) $\rightarrow$ **$Q1$** del Año Fiscal Siguiente ($\text{Año} + 1$).
   - **Noviembre, Diciembre, Enero** (`Mo 11..1`) $\rightarrow$ **$Q2$** del Año Fiscal Siguiente ($\text{Año} + 1$).
   - **Febrero, Marzo, Abril** (`Mo 2..4`) $\rightarrow$ **$Q3$** del Año Fiscal en curso ($\text{Año}$).
   - **Mayo, Junio, Julio** (`Mo 5..7`) $\rightarrow$ **$Q4$** del Año Fiscal en curso ($\text{Año}$ - Form 10-K).

2. **Empresas con Cierre Fiscal en Enero / Febrero** (`closingMonth === 1` o `2`, ej. **Nvidia - NVDA**, **Walmart - WMT**, **CRWD**):
   - **Marzo, Abril, Mayo** (`Mo 3..5`) $\rightarrow$ **$Q1$** del Año Fiscal Siguiente ($\text{Año} + 1$).
   - **Junio, Julio, Agosto** (`Mo 6..8`) $\rightarrow$ **$Q2$** del Año Fiscal Siguiente ($\text{Año} + 1$).
   - **Septiembre, Octubre, Noviembre** (`Mo 9..11`) $\rightarrow$ **$Q3$** del Año Fiscal Siguiente ($\text{Año} + 1$).
   - **Diciembre, Enero, Febrero** (`Mo 12..2`) $\rightarrow$ **$Q4$** del Año Fiscal en curso ($\text{Año}$ - Form 10-K).

3. **Empresas con Cierre Fiscal en Septiembre** (`closingMonth === 9` o `10`, ej. **Apple - AAPL**, **Qualcomm - QCOM**, **SBUX**):
   - **Noviembre, Diciembre, Enero** (`Mo 11..1`) $\rightarrow$ **$Q1$** del Año Fiscal Siguiente ($\text{Año} + 1$).
   - **Febrero, Marzo, Abril** (`Mo 2..4`) $\rightarrow$ **$Q2$** ($\text{Año}$).
   - **Mayo, Junio, Julio** (`Mo 5..7`) $\rightarrow$ **$Q3$** ($\text{Año}$).
   - **Agosto, Septiembre, Octubre** (`Mo 8..10`) $\rightarrow$ **$Q4$** ($\text{Año}$ - Form 10-K).

4. **Empresas con Cierre Fiscal en Diciembre** (`closingMonth === 12`, ej. **AMZN, GOOGL, META, TSLA, NFLX**):
   - **Enero, Febrero, Marzo** (`Mo 1..3`) $\rightarrow$ **$Q1$** ($\text{Año}$).
   - **Abril, Mayo, Junio** (`Mo 4..6`) $\rightarrow$ **$Q2$** ($\text{Año}$).
   - **Julio, Agosto, Septiembre** (`Mo 7..9`) $\rightarrow$ **$Q3$** ($\text{Año}$).
   - **Octubre, Noviembre, Diciembre** (`Mo 10..12`) $\rightarrow$ **$Q4$** ($\text{Año}$ - Form 10-K).

---

## 4. Algoritmo de Derivación del Trimestre Q4

Debido a que las empresas estadounidenses **no emiten un Formulario 10-Q de 3 meses para el cuarto trimestre (Q4)**, el valor de $Q4$ se deriva formalmente a partir del reporte anual auditado Formulario 10-K:

$$\text{EPS}_{Q4} = \text{EPS}_{\text{Form 10-K FY}} - \left( \text{EPS}_{Q1} + \text{EPS}_{Q2} + \text{EPS}_{Q3} \right)$$

- Se ajustan todos los valores previamente por **split acumulativo de acciones** (`YahooFinance stockSplits`).
- Se registra la entrada $Q4$ con la fecha de cierre oficial del Formulario 10-K (`fyEndDate`) para mantener la continuidad del calendario.

---

## 5. Salvaguardas Automatizadas Contra Regresiones

Para garantizar que ningún agente o desarrollador altere o rompa estas reglas por omisión en el futuro, se han establecido tres capas de protección:

1. **Test Automatizado de Auditoría (`npm run test:eps-rules`)**:
   - Ubicado en `apps/backend/src/__tests__/eps-rules.spec.ts`.
   - Ejecuta validaciones automatizadas sobre los datos procesados de **AAPL**, **NVDA**, **MSFT** y **AMZN**.
   - Verifica:
     - Que todos los años tengan exactamente 4/4 trimestres.
     - Que no existan trimestres duplicados ($Q1, Q1$).
     - Que los periodos de NVDA, MSFT y AAPL coincidan con sus cierres de 10-K auditados.

2. **Comentarios de Bloqueo en Código Fuente (`CRITICAL DO NOT MODIFY`)**:
   - Presentes en `sync-all-stocks-edgar.ts` y `StockHistoryTable.tsx`.

3. **Regla Antigravity Persistente (`.antigravity/rules`)**:
   - Registrada en la configuración del agente AI para ser evaluada antes de cualquier modificación al parser de SEC EDGAR o desgloses de EPS.
   - En la vista Anual o filas históricas, busca los trimestres donde `q.fiscalYear === targetYr`.
   - Si existen los 4 trimestres auditados (`length === 4`), calcula la suma exacta del Form 10-K. Si falta alguno, marca `N/A`.
