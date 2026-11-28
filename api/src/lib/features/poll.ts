// Date poll (migration 0015). The host proposes up to MAX_OPTIONS date/times
// before fixing one; guests vote yes / maybe / no with their invite token; the
// host picks one, which sets the event date, closes the poll and sends ONE
// email to guests we have already written to (or who voted). Tested in
// poll.test.ts.

export const MAX_OPTIONS = 5;

export type Answer = "yes" | "maybe" | "no";

export type Tally = { optionId: string; yes: number; maybe: number; no: number; score: number };

/** yes = 2, maybe = 1, no = 0. Highest score first, then most yes, then earliest. */
export function tallyPoll(
  options: { id: string; startsAt: Date }[],
  votes: { optionId: string; answer: string }[],
): Tally[] {
  const by = new Map<string, Tally>();
  for (const o of options) by.set(o.id, { optionId: o.id, yes: 0, maybe: 0, no: 0, score: 0 });
  for (const v of votes) {
    const t = by.get(v.optionId);
    if (!t) continue;
    if (v.answer === "yes") {
      t.yes += 1;
      t.score += 2;
    } else if (v.answer === "maybe") {
      t.maybe += 1;
      t.score += 1;
    } else if (v.answer === "no") t.no += 1;
  }
  const start = new Map(options.map((o) => [o.id, o.startsAt.getTime()]));
  return [...by.values()].sort(
    (a, b) => b.score - a.score || b.yes - a.yes || start.get(a.optionId)! - start.get(b.optionId)!,
  );
}

export function leader(tallies: Tally[]): string | null {
  return tallies.length && tallies[0].score > 0 ? tallies[0].optionId : null;
}

export type OptionInput = { startsAt: Date; endsAt?: Date | null };

export function optionsProblem(opts: OptionInput[], now: Date): "too_many_options" | "too_few_options" | "option_in_past" | "ends_before_starts" | "duplicate_option" | null {
  if (opts.length > MAX_OPTIONS) return "too_many_options";
  if (opts.length < 2) return "too_few_options";
  const seen = new Set<number>();
  for (const o of opts) {
    if (o.startsAt.getTime() <= now.getTime()) return "option_in_past";
    if (o.endsAt && o.endsAt.getTime() < o.startsAt.getTime()) return "ends_before_starts";
    if (seen.has(o.startsAt.getTime())) return "duplicate_option";
    seen.add(o.startsAt.getTime());
  }
  return null;
}

/** Who hears that a date was picked: people we have already emailed, who replied, or who voted. Never a cold address. */
export function shouldNotifyOfDate(g: { email: string | null; invitedAt: Date | null; respondedAt: Date | null; rsvpStatus: string }, voted: boolean): boolean {
  if (!g.email) return false;
  if (g.rsvpStatus === "declined") return false;
  return Boolean(g.invitedAt || g.respondedAt || voted);
}
