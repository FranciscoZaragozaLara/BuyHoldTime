// Fecha de mercado (Nueva York, YYYY-MM-DD) de un instante. `new Date().toISOString()` da la fecha UTC: después de
// las 19:00 ET (18:00 en CDMX) ya es el día siguiente, y el resumen del BHT mostraba el 26-nov la tarde del 25.
export function marketDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(at);
}
