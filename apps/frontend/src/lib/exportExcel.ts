'use client';
import * as XLSX from 'xlsx';

export function exportToExcel(filename: string, sheets: { name: string; headers: string[]; rows: (string|number)[][] }[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    // auto width
    const colWidths = sheet.headers.map((h, i) => {
      const maxLen = Math.max(h.length, ...sheet.rows.map(r => String(r[i] ?? '').length));
      return { wch: Math.min(Math.max(maxLen + 2, 10), 30) };
    });
    (ws as any)['!cols'] = colWidths;
    // header style bold
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) {
        cell.s = { font: { bold: true, color: { rgb: '0E7490' } }, fill: { fgColor: { rgb: '0F172A' } } };
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0,31));
  }
  XLSX.writeFile(wb, filename);
}
