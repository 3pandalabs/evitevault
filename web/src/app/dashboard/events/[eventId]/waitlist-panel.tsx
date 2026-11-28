"use client";

import { Check, Hourglass, Loader2, X } from "lucide-react";
import { useState } from "react";
import { decideGuest, mailNote } from "@/lib/api/extras";
import type { GuestRow } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";
import { Panel } from "../../ui";

// Guests waiting for the host's OK: the event was full, or every "going"
// needs approval. Approving sends one email (quota permitting); declining
// sends none.
export function WaitlistPanel({
  eventId,
  guests,
  capacity,
  headcount,
  onChanged,
}: {
  eventId: string;
  guests: GuestRow[];
  capacity: number | null;
  headcount: number;
  onChanged: () => void;
}) {
  const waiting = guests.filter((g) => g.rsvpStatus === "waitlisted");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (waiting.length === 0) return null;

  async function decide(g: GuestRow, d: "approve" | "decline") {
    const party = 1 + g.plusOnes;
    if (d === "approve" && capacity && headcount + party > capacity && !window.confirm(`This puts you over capacity (${headcount + party} of ${capacity}). Approve anyway?`)) return;
    setBusy(g.id);
    setNote(null);
    try {
      const r = await decideGuest(eventId, g.id, d);
      setNote(d === "approve" ? `${g.name} is confirmed. ${g.email ? mailNote(r, g.name.split(" ")[0]) : "No email on file — let them know yourself."}` : `${g.name} was declined (no email sent).`);
      onChanged();
    } catch {
      setNote("Couldn't save that. Please refresh and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title={`Waiting for you (${waiting.length})`} icon={Hourglass} description="They said they're going. Approve to give them a place, or decline.">
      <ul className="divide-y divide-zinc-100">
        {waiting.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-900">
                {g.name} <span className="font-normal text-zinc-500">· party of {1 + g.plusOnes}</span>
              </p>
              <p className="text-xs text-zinc-500">
                {g.waitlistReason === "capacity" ? "Joined the waitlist (event full)" : "Asked to come"}
                {g.respondedAt ? ` · ${formatRelative(g.respondedAt)}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-full" disabled={busy === g.id} onClick={() => decide(g, "approve")}>
                {busy === g.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Approve
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" disabled={busy === g.id} onClick={() => decide(g, "decline")}>
                <X className="size-4" />
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {note ? <p className="mt-3 text-sm text-zinc-700">{note}</p> : null}
    </Panel>
  );
}
