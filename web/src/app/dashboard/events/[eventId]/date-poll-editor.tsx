"use client";

import { CalendarClock, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { cancelPoll, getPoll, mailNote, pickPollOption, savePoll, type HostPoll } from "@/lib/api/extras";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { utcToZonedWallTime, zonedWallTimeToUtc } from "@/lib/datetime";
import { formatEventDate, formatEventTime } from "@/lib/utils";
import { Panel } from "../../ui";

const ERRORS: Record<string, string> = {
  too_few_options: "Add at least two options.",
  too_many_options: "Up to five options.",
  option_in_past: "Every option has to be in the future.",
  duplicate_option: "Two options are at the same time.",
  poll_closed: "A date was already picked.",
};

// "Which date works?" Propose 2-5 date/times before fixing one; guests vote
// from their personal link; picking one sets the event date, closes the poll
// and sends one email to guests you're already in touch with.
export function DatePollEditor({ eventId, timezone, onPicked }: { eventId: string; timezone: string; onPicked: () => void }) {
  const [poll, setPoll] = useState<HostPoll | null>(null);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(() => {
    getPoll(eventId)
      .then((p) => {
        setPoll(p);
        setDrafts(p.options.length ? p.options.map((o) => utcToZonedWallTime(o.startsAt, timezone)) : ["", ""]);
      })
      .catch(() => setPoll(null));
  }, [eventId, timezone]);
  useEffect(load, [load]);

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const options = drafts.filter(Boolean).map((d) => ({ startsAt: zonedWallTimeToUtc(d, timezone).toISOString() }));
      setPoll(await savePoll(eventId, options));
      setNote({ text: "Poll is open — guests see it on the invitation." });
    } catch (err) {
      setNote({ text: ERRORS[err instanceof ApiError ? err.code : ""] ?? "Couldn't save the poll.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function pick(optionId: string) {
    if (!window.confirm("Set the event to this date and close the poll? Guests you've already invited (or who voted) get one email.")) return;
    setBusy(true);
    try {
      const r = await pickPollOption(eventId, optionId, true);
      setNote({ text: `Date set. ${r.notified ? mailNote(r, "guests") : "Nobody needed an email."}` });
      load();
      onPicked();
    } catch (err) {
      setNote({ text: ERRORS[err instanceof ApiError ? err.code : ""] ?? "Couldn't set the date.", error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!poll) return null;
  const open = poll.status === "open";

  return (
    <Panel title="Date poll" icon={CalendarClock} description="Not sure of the date yet? Offer guests a few options and let them vote, then pick one.">
      {poll.status === "closed" ? (
        <p className="text-sm text-zinc-600">A date was picked{poll.closedAt ? ` ${formatEventDate(poll.closedAt, timezone)}` : ""}. The poll is closed.</p>
      ) : (
        <div className="space-y-3">
          {open && poll.options.length ? (
            <ul className="space-y-2">
              {poll.options
                .slice()
                .sort((a, b) => poll.ranking.indexOf(a.id) - poll.ranking.indexOf(b.id))
                .map((o, i) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-zinc-900">
                        {formatEventDate(o.startsAt, timezone)} · {formatEventTime(o.startsAt, timezone)}
                        {i === 0 && o.tally.score > 0 ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Leading</span> : null}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {o.tally.yes} yes · {o.tally.maybe} maybe · {o.tally.no} no
                        {o.voters.length ? ` — ${o.voters.filter((v) => v.answer === "yes").map((v) => v.name.split(" ")[0]).join(", ")}` : ""}
                      </p>
                    </div>
                    <Button size="sm" className="rounded-full" disabled={busy} onClick={() => pick(o.id)}>
                      <Check className="size-4" /> Pick this
                    </Button>
                  </li>
                ))}
            </ul>
          ) : null}
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-700">{open ? "Edit options" : "Options"} ({timezone})</p>
            {drafts.map((d, i) => (
              <div key={i} className="flex gap-2">
                <Input type="datetime-local" aria-label={`Option ${i + 1}`} value={d} onChange={(e) => setDrafts((ds) => ds.map((x, j) => (j === i ? e.target.value : x)))} />
                <Button variant="ghost" size="sm" aria-label="Remove option" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {drafts.length < 5 ? (
              <Button variant="ghost" size="sm" onClick={() => setDrafts((ds) => [...ds, ""])}>
                <Plus className="size-4" /> Option
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-full" disabled={busy} onClick={save}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {open ? "Update poll" : "Start the poll"}
            </Button>
            {open ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("Remove the poll and its votes?")) return;
                  await cancelPoll(eventId);
                  load();
                }}
              >
                Remove poll
              </Button>
            ) : null}
          </div>
          {open ? <p className="text-xs text-zinc-500">{poll.voterCount} guest{poll.voterCount === 1 ? " has" : "s have"} voted. Changing an option&apos;s time clears its votes.</p> : null}
        </div>
      )}
      {note ? <p className={note.error ? "mt-3 text-sm text-red-600" : "mt-3 text-sm text-zinc-700"}>{note.text}</p> : null}
    </Panel>
  );
}
