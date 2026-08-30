/**
 * Shared CSV export.
 *
 * Several tools produce a table worth keeping and had no way to take it
 * anywhere; the two that did each carried their own copy of this. Extracted so
 * quoting and the download mechanics are written once.
 *
 * Values are always quoted and embedded quotes doubled, which is what RFC 4180
 * requires and what keeps commas, newlines and quotes inside a cell from
 * splitting the row when a spreadsheet reads it back.
 */

export type CsvCell = string | number | boolean | null | undefined;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
}

/**
 * Build a CSV and hand it to the browser as a download.
 *
 * A BOM is prepended so Excel reads the file as UTF-8 — without it, accented
 * characters and anything non-Latin arrive mangled, which matters here because
 * these tables routinely carry page titles and business names.
 */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  const csv = toCsv(headers, rows);
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Timestamped filename so repeated exports do not overwrite each other. */
export function stampedName(base: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${base}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
}
