"use client";

import { CalendarClock, Loader2 } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { votePoll } from "@/lib/api/guestExtras";
import type { PublicPoll } from "@/lib/api/public";
import { cn, formatEventDate, formatEventTime } from "@/lib/utils";

type Answer = "yes" | "maybe" | "no";
const LABELS: Record<Answer, string> = { yes: "Works", maybe: "Maybe", no: "Can't" };

// "Which date works?" — the host is still choosing. A guest with their
// personal link marks each option; everyone sees the counts, never names.
export function DatePoll({ slug, token, timezone, initial }: { slug: string; token?: string; timezone: string; initial: PublicPoll }) {
  const [poll, setPoll] = useState(initial);
  const [picks, setPicks] = useState<Record<string, Answer | null>>(
    Object.fromEntries(initial.options.map((o) => [o.id, o.mine])),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const votes = Object.entries(picks)
        .filter((e): e is [string, Answer] => e[1] !== null)
        .map(([optionId, answer]) => ({ optionId, answer }));
      const r = await votePoll(slug, token, votes);
      if (r.poll) setPoll(r.poll);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "poll_closed" ? "The host has already picked a date." : "Couldn't save your votes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ev-surface mt-8 rounded-2xl p-5 shadow-sm sm:p-8">
      <h2 className="ev-heading flex items-center gap-2 text-xl font-semibold">
        <CalendarClock className="size-5" style={{ color: "var(--ev-accent)" }} />
        Which date works for you?
      </h2>
      <p className="ev-muted mt-1 text-sm">
        The host hasn&apos;t fixed the date yet.{" "}
        {token ? "Mark every option that works — they'll let you know when it's set." : "Open your personal invitation link to vote."}
      </p>
      <ul className="mt-4 space-y-3">
        {poll.options.map((o) => (
          <li key={o.id} className="rounded-xl border border-black/10 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {formatEventDate(o.startsAt, timezone)} · {formatEventTime(o.startsAt, timezone)}
              </p>
              <p className="ev-muted text-xs tabular-nums">
                {o.yes} yes · {o.maybe} maybe · {o.no} no
              </p>
            </div>
            {token ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["yes", "maybe", "no"] as Answer[]).map((a) => {
                  const selected = picks[o.id] === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setSaved(false);
                        setPicks((p) => ({ ...p, [o.id]: selected ? null : a }));
                      }}
                      className={cn("rounded-lg border-2 px-2 py-1.5 text-sm", selected ? "border-[var(--ev-accent)]" : "border-black/10")}
                      style={selected ? { backgroundColor: "var(--ev-accent)", color: "var(--ev-accent-text)" } : undefined}
                    >
                      {LABELS[a]}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {token ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
            style={{ backgroundColor: "var(--ev-accent)", color: "var(--ev-accent-text)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save my votes
          </button>
          {saved ? <span className="ev-muted text-sm">Saved — thanks!</span> : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
