import { describe, expect, it } from "vitest";
import { buildImport, parseCsv } from "./guestImport";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, CRLF and a BOM", () => {
    const t = '﻿Name,Email\r\n"Iyer, Meera","meera@x.com"\r\n"Sam ""the man"" Lee",sam@x.com\n';
    expect(parseCsv(t)).toEqual([
      ["Name", "Email"],
      ["Iyer, Meera", "meera@x.com"],
      ['Sam "the man" Lee', "sam@x.com"],
    ]);
  });

  it("detects semicolon-separated files; blank lines are ignored by the import", () => {
    expect(parseCsv("Name;Email\nA;a@x.com\n")).toEqual([
      ["Name", "Email"],
      ["A", "a@x.com"],
    ]);
    expect(buildImport("\nName;Email\n\nA;a@x.com\n").rows).toEqual([{ name: "A", email: "a@x.com", phone: null }]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('Name,Note\n"A","line1\nline2"\n')).toEqual([
      ["Name", "Note"],
      ["A", "line1\nline2"],
    ]);
  });
});

describe("buildImport", () => {
  it("maps a plain sheet and dedupes within the file and against existing guests", () => {
    const csv = "Name,Email,Phone\nMeera,MEERA@x.com,555\nMeera again,meera@x.com,\nOld,old@x.com,\nNo Email,,\n,,\nBad,not-an-email,\n";
    const p = buildImport(csv, ["old@x.com"]);
    expect(p.rows).toEqual([
      { name: "Meera", email: "meera@x.com", phone: "555" },
      { name: "No Email", email: null, phone: null },
    ]);
    expect(p.skipped).toEqual([
      { line: 3, reason: "duplicate" },
      { line: 4, reason: "already_invited" },
      { line: 7, reason: "bad_email" },
    ]);
    expect(p.columns).toEqual({ name: "Name", email: "Email", phone: "Phone" });
  });

  it("reads a Google Contacts export (first/last name, E-mail 1 - Value, ::: lists)", () => {
    const csv =
      "First Name,Middle Name,Last Name,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value\n" +
      "Meera,,Iyer,* Home,meera@x.com ::: meera@work.com,Mobile,+1 555 0100\n" +
      "Sam,,,,,,\n";
    const p = buildImport(csv);
    expect(p.rows).toEqual([
      { name: "Meera Iyer", email: "meera@x.com", phone: "+1 555 0100" },
      { name: "Sam", email: null, phone: null },
    ]);
  });

  it("reads the older Given/Family Name export", () => {
    const p = buildImport("Given Name,Family Name,E-mail 1 - Value\nPat,Kim,pat@x.com\n");
    expect(p.rows).toEqual([{ name: "Pat Kim", email: "pat@x.com", phone: null }]);
  });

  it("works without a header row", () => {
    const p = buildImport("Meera Iyer,meera@x.com\nSam,sam@x.com\n");
    expect(p.rows.map((r) => r.email)).toEqual(["meera@x.com", "sam@x.com"]);
  });

  it("uses the email's local part when only an address is given", () => {
    const p = buildImport("Email\njo@x.com\n");
    expect(p.rows).toEqual([{ name: "jo", email: "jo@x.com", phone: null }]);
  });
});
