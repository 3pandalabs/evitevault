"use client";

import { Copy, Loader2, UserPlus, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { inviteCohost, listCohosts, mailNote, removeCohost, type Cohost } from "@/lib/api/extras";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "../../ui";

const ERRORS: Record<string, string> = {
  already_invited: "That address is already a co-host.",
  owner_cannot_cohost: "That's your own address.",
  too_many_cohosts: "An event can have up to 5 co-hosts.",
  owner_only: "Only the event's owner can invite co-hosts.",
};

// Co-hosts manage the event and guests with you, and are named on the
// invitation. They can't delete the event, hand it over, add co-hosts, or use
// paid features.
export function CohostsPanel({ eventId, isOwner }: { eventId: string; isOwner: boolean }) {
  const [rows, setRows] = useState<Cohost[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; link?: string; error?: boolean } | null>(null);

  const load = useCallback(() => {
    listCohosts(eventId)
      .then((r) => setRows(r.cohosts))
      .catch(() => setRows([]));
  }, [eventId]);
  useEffect(load, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const r = await inviteCohost(eventId, { name: name.trim(), email: email.trim() });
      const sent = r.emailed > 0;
      setNote({ text: sent ? `Invitation emailed to ${r.cohost.email}.` : `${mailNote(r, "they")} Send them this link:`.trim(), link: sent ? undefined : r.acceptUrl });
      setName("");
      setEmail("");
      load();
    } catch (err) {
      setNote({ text: ERRORS[err instanceof ApiError ? err.code : ""] ?? "Couldn't invite them. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Cohost) {
    if (!window.confirm(`Remove ${c.name} as co-host?`)) return;
    await removeCohost(eventId, c.id).catch(() => undefined);
    load();
  }

  return (
    <Panel
      title="Co-hosts"
      icon={Users}
      description="They can edit the event, manage guests and replies, and are named on the invitation. They can't delete the event or use paid features."
    >
      {rows === null ? (
        <Loader2 className="size-4 animate-spin text-zinc-400" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No co-hosts yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-zinc-900">{c.name}</span>{" "}
                <span className="text-zinc-500">· {c.email}</span>
                <span className={c.status === "accepted" ? "ml-2 text-xs text-emerald-700" : "ml-2 text-xs text-amber-700"}>
                  {c.status === "accepted" ? "Co-host" : "Invited"}
                </span>
              </div>
              {c.acceptUrl ? (
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(c.acceptUrl!)}>
                  <Copy className="size-3.5" /> Copy link
                </Button>
              ) : null}
              {isOwner ? (
                <Button variant="ghost" size="sm" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}>
                  <X className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        <form onSubmit={invite} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input aria-label="Co-host name" placeholder="Name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <Input aria-label="Co-host email" type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="default" className="rounded-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Invite
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">You&apos;re a co-host on this event. Only the owner can add or remove co-hosts.</p>
      )}
      {note ? (
        <div className={note.error ? "mt-3 text-sm text-red-600" : "mt-3 text-sm text-zinc-700"}>
          {note.text}
          {note.link ? <code className="mt-1 block truncate rounded bg-zinc-100 px-2 py-1 text-xs">{note.link}</code> : null}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-zinc-500">They accept by signing in (or creating a free account) with the address you invite.</p>
    </Panel>
  );
}
