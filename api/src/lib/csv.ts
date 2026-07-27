// A field starting with = + - @ (or tab/CR, which Excel strips before parsing)
// is executed as a formula when the file is opened in Excel/Sheets. Guest names
// and free-text notes are attacker-controlled here — anyone holding an
// invitation link can type into them — so every field is neutralised with a
// leading apostrophe before quoting. This is the whole reason exports don't
// just `.join(",")`.
function neutralise(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  return `"${neutralise(s).replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 correctly — without it, any non-ASCII guest name
  // renders as mojibake on Windows.
  const body = [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n");
  return "﻿" + body + "\r\n";
}
