# Guía de Implementación: Calculadora Multi-Escenario de Valoración (3-Way Model)

## Contexto de Negocio (Para el Desarrollador: antigravity)
Esta calculadora está diseñada para evaluar el precio futuro de un activo (ej. NVDA, VOO, QQQ) bajo tres escenarios de múltiplos: TTM (Trailing Twelve Months), Forward (Proyectado) y Mix (Híbrido). El objetivo principal es mitigar el riesgo de compresión de múltiplos en entornos macroeconómicos de altas tasas de interés y sobrevaloración sistémica (Shiller PE > 40). 

La interfaz debe permitir variaciones porcentuales dinámicas para estresar el modelo ante caídas en las utilidades (EPS) o contracción del múltiplo (PE).

## 1. Definición de Entradas (Inputs)

### Datos provenientes de la API (Validación recomendada: Zod)
Es crítico asegurar el tipado estricto de los datos financieros recibidos de los *endpoints* para evitar cálculos fallidos:
*   `current_price` (number): Precio de cotización actual.
*   `pe_ttm` (number): Múltiplo Precio/Beneficio de los últimos 12 meses.
*   `pe_fwd` (number): Múltiplo Precio/Beneficio estimado del próximo año.
*   `eps_projections` (Array of Objects): Arreglo de proyecciones anuales.
    *   `year` (string): e.g., "Jan 2027"
    *   `eps_base_ttm` (number): EPS del año en curso de la iteración.
    *   `eps_base_fwd` (number): EPS del año siguiente de la iteración.

### Estado Interactivo del Usuario (React State)
*   `eps_variance_pct` (number): Rango de -50 a 50 (por defecto 0).
*   `pe_variance_pct` (number): Rango de -50 a 50 (por defecto 0).

## 2. Motor de Cálculo (Lógica de Negocio)

**Paso A: Constantes Base del Modelo**
*   `pe_mix` = `(pe_ttm + pe_fwd) / 2`

**Paso B: Ajuste Dinámico por Varianza**
*   `adj_pe_ttm` = `pe_ttm * (1 + (pe_variance_pct / 100))`
*   `adj_pe_fwd` = `pe_fwd * (1 + (pe_variance_pct / 100))`
*   `adj_pe_mix` = `pe_mix * (1 + (pe_variance_pct / 100))`
*   *Nota: El factor de varianza de EPS se calculará por cada iteración del año.*

**Paso C: Iteración del Array de Proyecciones (`eps_projections.map()`)**
Para cada año (fila), calcular:
1.  **Escenario TTM:**
    *   `adj_eps_ttm` = `eps_base_ttm * (1 + (eps_variance_pct / 100))`
    *   `projected_price_ttm` = `adj_eps_ttm * adj_pe_ttm`
2.  **Escenario Forward:**
    *   `adj_eps_fwd` = `eps_base_fwd * (1 + (eps_variance_pct / 100))`
    *   `projected_price_fwd` = `adj_eps_fwd * adj_pe_fwd`
3.  **Escenario Mix (Promedio):**
    *   `eps_mix` = `(eps_base_ttm + eps_base_fwd) / 2`
    *   `adj_eps_mix` = `eps_mix * (1 + (eps_variance_pct / 100))`
    *   `projected_price_mix` = `adj_eps_mix * adj_pe_mix`

## 3. Suite de Pruebas Unitarias (Jest Test Cases)

Para verificar que el motor matemático sea exacto antes de conectarlo a la UI, implementar los siguientes tests usando el caso real de **NVDA**.

### Mock Data (NVDA Snapshot)
```javascript
const mockNVDA = {
  pe_ttm: 30.12,
  pe_fwd: 22.00,
  eps_projections: [
    { year: "Jan 2027", eps_base_ttm: 9.55, eps_base_fwd: 13.05 }
  ]
};