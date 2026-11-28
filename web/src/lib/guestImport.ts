// Guest import from a CSV file (a spreadsheet export, or Google Contacts'
// "Export > Google CSV"). Pure: parse, map columns, dedupe. Tested in
// guestImport.test.ts. Nothing is uploaded: the browser reads the file, the
// host reviews a preview, and only the chosen rows are sent to the existing
// POST /events/:id/guests (which dedupes again against the database).

export type ImportRow = { name: string; email: string | null; phone: string | null };

export type ImportPreview = {
  rows: ImportRow[];
  /** Rows dropped, and why, so the preview can say so. */
  skipped: { line: number; reason: "no_name" | "duplicate" | "already_invited" | "bad_email" }[];
  columns: { name: string; email: string | null; phone: string | null };
};

export const MAX_IMPORT_ROWS = 500;

const blank = (r: string[]) => r.every((f) => f.trim() === "");

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF/LF, a leading BOM, `;` or tab when that is clearly the separator. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const sep = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines are kept (as rows of empty fields) so line numbers in the
  // preview match the file; buildImport ignores them.
  return rows;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function findCol(headers: string[], candidates: string[]): number {
  const hs = headers.map(norm);
  for (const c of candidates) {
    const i = hs.indexOf(c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = hs.findIndex((h) => h.startsWith(c));
    if (i >= 0) return i;
  }
  return -1;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Maps columns by header. Understands plain sheets (Name / Email / Phone),
 * First + Last name, and Google Contacts exports ("First Name", "Last Name",
 * "E-mail 1 - Value", "Phone 1 - Value"; older "Given Name" / "Family Name").
 * With no recognisable header, the first column is the name and the first
 * column that looks like an address is the email.
 */
export function buildImport(text: string, existingEmails: Iterable<string> = []): ImportPreview {
  const all = parseCsv(text);
  // Leading blank lines are dropped (the header is the first real line).
  const lead = all.findIndex((r) => !blank(r));
  const table = lead < 0 ? [] : all.slice(lead);
  const empty: ImportPreview = { rows: [], skipped: [], columns: { name: "", email: null, phone: null } };
  if (table.length === 0) return empty;

  const headers = table[0];
  let nameCol = findCol(headers, ["name", "full name", "display name", "guest", "guest name"]);
  const firstCol = findCol(headers, ["first name", "given name", "first"]);
  const lastCol = findCol(headers, ["last name", "family name", "surname", "last"]);
  const emailCol = findCol(headers, ["email", "e mail", "email address", "e mail address", "e mail 1 value", "email 1 value"]);
  const phoneCol = findCol(headers, ["phone", "mobile", "phone number", "phone 1 value", "mobile phone", "cell"]);
  const hasHeader = nameCol >= 0 || firstCol >= 0 || emailCol >= 0;

  let body = table;
  let eCol = emailCol;
  if (hasHeader) body = table.slice(1);
  else {
    nameCol = 0;
    eCol = table[0].findIndex((f) => EMAIL.test(f.trim()));
  }

  const existing = new Set([...existingEmails].map((e) => e.trim().toLowerCase()));
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  const skipped: ImportPreview["skipped"] = [];

  body.forEach((r, idx) => {
    const line = idx + (hasHeader ? 2 : 1);
    if (blank(r)) return;
    const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    let name = cell(nameCol);
    if (!name && (firstCol >= 0 || lastCol >= 0)) name = [cell(firstCol), cell(lastCol)].filter(Boolean).join(" ");
    // Google exports can carry several addresses in one cell: "a@x ::: b@y".
    const rawEmail = cell(eCol).split(/\s*:::\s*|[;,]\s*/)[0]?.trim() ?? "";
    const phone = cell(phoneCol).split(/\s*:::\s*/)[0]?.trim() || null;
    if (!name && rawEmail) name = rawEmail.split("@")[0];
    if (!name) return skipped.push({ line, reason: "no_name" });
    let email: string | null = null;
    if (rawEmail) {
      if (!EMAIL.test(rawEmail)) return skipped.push({ line, reason: "bad_email" });
      email = rawEmail.toLowerCase();
      if (existing.has(email)) return skipped.push({ line, reason: "already_invited" });
      if (seen.has(email)) return skipped.push({ line, reason: "duplicate" });
      seen.add(email);
    }
    if (rows.length < MAX_IMPORT_ROWS) rows.push({ name: name.slice(0, 200), email, phone: phone ? phone.slice(0, 40) : null });
  });

  return {
    rows,
    skipped,
    columns: {
      name: nameCol >= 0 ? (headers[nameCol] ?? "") : [headers[firstCol], headers[lastCol]].filter(Boolean).join(" + "),
      email: eCol >= 0 && hasHeader ? headers[eCol] : eCol >= 0 ? "(detected)" : null,
      phone: phoneCol >= 0 ? headers[phoneCol] : null,
    },
  };
}
