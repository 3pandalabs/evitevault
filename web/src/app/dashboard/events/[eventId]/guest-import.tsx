"use client";

import { FileUp, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { addGuests, type GuestRow } from "@/lib/api/host";
import { buildImport, type ImportPreview } from "@/lib/guestImport";
import { Button } from "@/components/ui/button";
import { Panel } from "../../ui";

const REASONS: Record<ImportPreview["skipped"][number]["reason"], string> = {
  no_name: "no name",
  duplicate: "repeated in the file",
  already_invited: "already on your list",
  bad_email: "email doesn't look right",
};

// Import guests from a CSV (any spreadsheet, or Google Contacts' "Export >
// Google CSV"). The file is read in the browser and never uploaded; the host
// sees a preview, then the chosen rows go through the normal add-guests path
// (which dedupes again) — so, exactly like typing them in, guests with an
// address are invited (the hourly job finishes what the daily limit can't).
export function GuestImport({ eventId, existing, onImported }: { eventId: string; existing: GuestRow[]; onImported: (msg: string) => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (f.size > 2_000_000) return setError("That file is too big — export just the contacts you want (under 2 MB).");
    const text = await f.text();
    const p = buildImport(text, existing.map((g) => g.email).filter((e): e is string => Boolean(e)));
    setFileName(f.name);
    setPreview(p);
    if (p.rows.length === 0) setError("No guests found in that file. It needs a Name (or First/Last name) column, and optionally Email and Phone.");
  }

  async function confirm() {
    if (!preview?.rows.length) return;
    setBusy(true);
    try {
      let added = 0;
      let emailed = 0;
      for (let i = 0; i < preview.rows.length; i += 500) {
        const r = await addGuests(eventId, preview.rows.slice(i, i + 500));
        added += r.added;
        emailed += r.emailed;
      }
      onImported(`Imported ${added} guest${added === 1 ? "" : "s"}, ${emailed} emailed so far.`);
      setPreview(null);
      if (input.current) input.current.value = "";
    } catch {
      setError("Couldn't import. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Import from a file" icon={FileUp} description="A CSV from any spreadsheet, or Google Contacts (Export → Google CSV). Columns: name (or first/last), email, phone.">
      <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button variant="outline" size="sm" className="rounded-full" onClick={() => input.current?.click()}>
        <Upload className="size-4" /> Choose a CSV file
      </Button>
      <p className="mt-2 text-xs text-zinc-500">The file stays on your device; only the guests you confirm are added.</p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {preview && preview.rows.length ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-zinc-700">
            <strong>{preview.rows.length}</strong> guest{preview.rows.length === 1 ? "" : "s"} from {fileName}
            {preview.skipped.length ? `, ${preview.skipped.length} skipped` : ""}.
          </p>
          <div className="max-h-64 overflow-auto rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-left text-xs text-zinc-500 uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Phone</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t border-zinc-100">
                    <td className="max-w-[9rem] truncate px-3 py-1.5">{r.name}</td>
                    <td className="max-w-[10rem] truncate px-3 py-1.5 text-zinc-600">{r.email ?? "—"}</td>
                    <td className="hidden px-3 py-1.5 text-zinc-600 sm:table-cell">{r.phone ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 200 ? <p className="text-xs text-zinc-500">Showing the first 200.</p> : null}
          {preview.skipped.length ? (
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer">Why {preview.skipped.length} were skipped</summary>
              <ul className="mt-1 space-y-0.5">
                {preview.skipped.slice(0, 50).map((s) => (
                  <li key={s.line}>
                    Line {s.line}: {REASONS[s.reason]}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="text-xs text-zinc-500">
            Guests with an email are sent their invitation, like adding them by hand. Past today&apos;s email limit, the rest go out automatically over the next days.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="rounded-full" disabled={busy} onClick={confirm}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Add {preview.rows.length} guest{preview.rows.length === 1 ? "" : "s"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
